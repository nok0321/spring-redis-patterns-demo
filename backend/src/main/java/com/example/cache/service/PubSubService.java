package com.example.cache.service;

import jakarta.annotation.PreDestroy;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Redis Pub/Sub デモサービス
 * Redisson の RTopic を使いメッセージをパブリッシュし、
 * SSE Emitter でブラウザへブロードキャストする
 */
@Service
public class PubSubService {

    private static final Logger logger = LoggerFactory.getLogger(PubSubService.class);

    /** SSE 同時接続数の上限 */
    private static final int MAX_EMITTERS = 100;

    private final RedissonClient redissonClient;

    public PubSubService(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final AtomicInteger emitterCount = new AtomicInteger(0);

    /** 重複登録防止: 既にリスナー登録済みのトピック一覧 */
    private final Set<String> subscribedTopics = ConcurrentHashMap.newKeySet();

    /** @PreDestroy でリスナー解除するために保持するトピック別リスナーID */
    private final Map<String, Integer> topicListenerIds = new ConcurrentHashMap<>();

    /** トピック名: 英数字・ハイフン・アンダースコア・ドットのみ許可、最大128文字 */
    private static final java.util.regex.Pattern VALID_TOPIC = java.util.regex.Pattern.compile("[\\w.\\-]{1,128}");

    private static void validateTopic(String topic) {
        if (topic == null || !VALID_TOPIC.matcher(topic).matches()) {
            throw new IllegalArgumentException(
                "Invalid topic name. Use alphanumeric, hyphen, underscore, or dot (max 128 chars): " + topic);
        }
    }

    /**
     * 指定トピックの Redis リスナーを登録する（1トピック1リスナー、重複登録なし）。
     * addListener は同期呼び出し → メソッド戻り時点でリスナーが確実に有効。
     */
    public void addSubscriber(String topic) {
        validateTopic(topic);
        if (subscribedTopics.add(topic)) {
            RTopic rTopic = redissonClient.getTopic(topic);
            int listenerId = rTopic.addListener(String.class, (channel, msg) -> {
                logger.info("受信: topic={}, message={}", channel, msg);
                broadcastToEmitters(topic, msg);
            });
            topicListenerIds.put(topic, listenerId);
            logger.info("トピック購読開始: {}", topic);
        }
    }

    /**
     * 指定トピックにメッセージを発行する
     */
    public long publish(String topic, String message) {
        validateTopic(topic);
        RTopic rTopic = redissonClient.getTopic(topic);
        long subscribers = rTopic.publish(message);
        logger.info("パブリッシュ: topic={}, message={}, subscribers={}", topic, message, subscribers);
        return subscribers;
    }

    /**
     * SSE Emitter を登録してブラウザへのプッシュを有効化する。
     * 同時接続数が MAX_EMITTERS を超える場合は例外をスローする。
     */
    public SseEmitter createEmitter() {
        // CAS ループで check-then-act を原子的に実行し TOCTOU を防ぐ
        int current;
        do {
            current = emitterCount.get();
            if (current >= MAX_EMITTERS) {
                logger.warn("SSE Emitter 上限超過: 現在 {} 個 (上限 {})", current, MAX_EMITTERS);
                throw new IllegalStateException("SSE connection limit reached (" + MAX_EMITTERS + ")");
            }
        } while (!emitterCount.compareAndSet(current, current + 1));

        SseEmitter emitter = new SseEmitter(5 * 60 * 1000L); // 5分タイムアウト
        emitters.add(emitter);
        // remove() が true を返した場合のみデクリメントし、
        // broadcastToEmitters による除去後のコールバック二重デクリメントを防ぐ
        Runnable cleanup = () -> {
            if (emitters.remove(emitter)) {
                emitterCount.decrementAndGet();
            }
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());
        logger.debug("SSE Emitter 追加: 現在 {} 個", emitterCount.get());
        return emitter;
    }

    @PreDestroy
    public void shutdown() {
        logger.info("PubSubService shutdown - removing all topic listeners");
        topicListenerIds.forEach((topic, listenerId) -> {
            try {
                redissonClient.getTopic(topic).removeListener(listenerId);
                logger.debug("リスナー解除: topic={}", topic);
            } catch (Exception e) {
                logger.warn("リスナー解除失敗: topic={}", topic, e);
            }
        });
        topicListenerIds.clear();
        subscribedTopics.clear();
    }

    private void broadcastToEmitters(String topic, String message) {
        Map<String, Object> payload = Map.of(
                "topic", topic,
                "message", message,
                "timestamp", System.currentTimeMillis());

        logger.debug("ブロードキャスト: topic={}, emitters数={}", topic, emitters.size());
        List<SseEmitter> deadEmitters = new java.util.ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().data(payload));
            } catch (Exception e) {
                logger.debug("SSE 送信失敗、エミッターを削除します", e);
                deadEmitters.add(emitter);
            }
        }
        if (!deadEmitters.isEmpty()) {
            // このメソッドは Redisson の非コンテナスレッドから呼ばれる。
            // dead.complete() は Spring が AsyncContext.dispatch() を呼ぶが、
            // AsyncContext がエラー状態の場合（クライアント切断後）に
            // IllegalStateException が発生するため直接クリーンアップする。
            // onError コールバックが先に cleanup を実行している場合は remove() が false を返し
            // 二重デクリメントを防ぐ。
            for (SseEmitter dead : deadEmitters) {
                if (emitters.remove(dead)) {
                    emitterCount.decrementAndGet();
                }
            }
            logger.debug("死亡エミッター除去: count={}, 残り={}", deadEmitters.size(), emitterCount.get());
        }
    }
}
