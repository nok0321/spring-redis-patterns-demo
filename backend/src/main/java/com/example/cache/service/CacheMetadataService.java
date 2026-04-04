package com.example.cache.service;

import org.redisson.api.RType;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Redis メタデータ操作（TTL / 型情報 / 型付き値取得）をカプセル化するサービス。
 * これらの操作は Resilience4j デコレータを通す必要がないため、RedissonClient を直接使用する。
 */
@Service
public class CacheMetadataService {

    private static final Logger logger = LoggerFactory.getLogger(CacheMetadataService.class);

    public record TtlInfo(long ttlMs, long ttlSeconds, boolean persistent) {}

    public record TypedValue(String key, String type, Object value) {}

    private final RedissonClient redissonClient;
    private final ExecutorService virtualExecutor;

    public CacheMetadataService(RedissonClient redissonClient,
                                @Qualifier("virtualThreadExecutor") ExecutorService virtualExecutor) {
        this.redissonClient = redissonClient;
        this.virtualExecutor = virtualExecutor;
    }

    /**
     * 指定したキーの TTL を取得する。
     * キーが存在しない場合（ttl == -2）は空の Optional を返す。
     */
    public Optional<TtlInfo> getTtl(String key) {
        long ttlMs = redissonClient.getBucket(key).remainTimeToLive();
        if (ttlMs == -2) {
            return Optional.empty();
        }
        boolean persistent = (ttlMs == -1);
        long ttlSeconds = persistent ? -1 : ttlMs / 1000;
        return Optional.of(new TtlInfo(ttlMs, ttlSeconds, persistent));
    }

    /**
     * 複数キーの TTL をバーチャルスレッドで並列取得する。
     * 存在しないキー（ttl == -2）は結果マップから除外される。
     */
    public Map<String, Map<String, Object>> getTtlBatch(String[] keys) throws Exception {
        Map<String, Map<String, Object>> results = new ConcurrentHashMap<>();
        java.util.List<CompletableFuture<Void>> futures = new java.util.ArrayList<>();

        for (String key : keys) {
            String k = key.trim();
            if (k.isEmpty()) continue;
            futures.add(CompletableFuture.runAsync(() -> {
                long ttlMs = redissonClient.getBucket(k).remainTimeToLive();
                boolean persistent = (ttlMs == -1);
                results.put(k, Map.of("ttlMs", ttlMs, "persistent", persistent));
            }, virtualExecutor));
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(5, TimeUnit.SECONDS);
        return results;
    }

    /**
     * 指定したキーの Redis データ型を返す。
     * キーが存在しない場合は空の Optional を返す。
     */
    public Optional<String> getKeyType(String key) {
        RType type = redissonClient.getKeys().getType(key);
        if (type == null) {
            return Optional.empty();
        }
        return Optional.of(type.name());
    }

    /**
     * Redis データ型に応じた適切な読み取り方法でキーの値を取得する。
     * キーが存在しない場合は空の Optional を返す。
     */
    public Optional<TypedValue> getTypedValue(String key) {
        RType type = redissonClient.getKeys().getType(key);
        if (type == null) {
            return Optional.empty();
        }
        Object value = switch (type) {
            case OBJECT  -> redissonClient.getBucket(key).get();
            case MAP     -> redissonClient.getMap(key).readAllMap();
            case LIST    -> redissonClient.getList(key).readAll();
            case SET     -> redissonClient.getSet(key).readAll();
            case ZSET    -> {
                var sset = redissonClient.<Object>getScoredSortedSet(key);
                yield sset.readAll();
            }
            case STREAM  -> "(Stream type: use Redis CLI for XRANGE/XREAD)";
            default      -> redissonClient.getBucket(key).get();
        };
        return Optional.of(new TypedValue(key, type.name(), value));
    }
}
