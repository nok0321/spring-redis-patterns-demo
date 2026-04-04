package com.example.cache.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Rate Limiter デモサービス
 * Redis バックエンドの分散レートリミッター（{@link DistributedRateLimiterService}）を使用して
 * トークンバケットアルゴリズムの動作をシミュレートする
 */
@Service
public class RateLimiterDemoService {

    private static final Logger logger = LoggerFactory.getLogger(RateLimiterDemoService.class);

    private final DistributedRateLimiterService distributedRateLimiter;

    public RateLimiterDemoService(DistributedRateLimiterService distributedRateLimiter) {
        this.distributedRateLimiter = distributedRateLimiter;
    }

    public record FloodEvent(int workerId, boolean permitted, long relativeMs) {}

    public record FloodResult(int requested, int permitted, int rejected, List<FloodEvent> events) {}

    /**
     * Rate Limiter の現在のステータスを取得する
     *
     * コントローラーの API レスポンス形式との互換性を維持するため、
     * 分散レートリミッターの状態を既存フィールドにマッピングする：
     * - availablePermissions ← Redis RRateLimiter の availablePermits
     * - numberOfWaitingThreads ← 分散環境では取得不可なため常に 0
     * - cyclePeriodMs ← RRateLimiter の rateInterval（ミリ秒）
     * - limitForPeriod ← RRateLimiter の rate
     */
    public record RateLimiterStatus(
        int availablePermissions,
        int numberOfWaitingThreads,
        long cyclePeriodMs,
        int limitForPeriod
    ) {}

    public RateLimiterStatus getRateLimiterStatus() {
        DistributedRateLimiterService.Status status = distributedRateLimiter.getStatus();
        return new RateLimiterStatus(
            (int) status.availablePermits(),
            0, // 分散環境では待機スレッド数は取得不可
            status.intervalMs(),
            (int) status.rate()
        );
    }

    /**
     * 大量リクエストを一斉に送りパーミッション取得成功/失敗を記録する
     *
     * @param workers    並行ワーカー数
     * @param burstCount 各ワーカーが発行するリクエスト数
     */
    public FloodResult executeFlood(int workers, int burstCount) {
        long startMs = System.currentTimeMillis();

        List<FloodEvent> events = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger permitted = new AtomicInteger();
        AtomicInteger rejected  = new AtomicInteger();

        CountDownLatch ready  = new CountDownLatch(workers);
        CountDownLatch go     = new CountDownLatch(1);
        CountDownLatch done   = new CountDownLatch(workers);

        int total = workers * burstCount;

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int w = 1; w <= workers; w++) {
                final int workerId = w;
                executor.submit(() -> {
                    ready.countDown();
                    try { go.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

                    for (int i = 0; i < burstCount; i++) {
                        boolean ok = distributedRateLimiter.tryAcquire();
                        long relMs = System.currentTimeMillis() - startMs;
                        events.add(new FloodEvent(workerId, ok, relMs));
                        if (ok) permitted.incrementAndGet(); else rejected.incrementAndGet();
                    }
                    done.countDown();
                });
            }

            // 全ワーカーが準備完了したら一斉スタート
            try { ready.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            go.countDown();
            try { done.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }

        logger.info("Flood 完了: total={}, permitted={}, rejected={}", total, permitted.get(), rejected.get());
        return new FloodResult(total, permitted.get(), rejected.get(), new ArrayList<>(events));
    }
}
