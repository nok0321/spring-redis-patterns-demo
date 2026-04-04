package com.example.cache;

import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;

/**
 * デモ用キャッシュデータのシーダー
 * アプリケーション起動時にサンプルデータを Redis に投入します。
 */
@Component
public class DataSeeder {

    private static final Logger logger = LoggerFactory.getLogger(DataSeeder.class);

    private final ExecutorService virtualExecutor;
    private final RedissonClient redissonClient;

    public DataSeeder(RedissonClient redissonClient, ExecutorService virtualThreadExecutor) {
        this.redissonClient = redissonClient;
        this.virtualExecutor = virtualThreadExecutor;
    }

    /** キーが存在しない場合のみ設定する（冪等シード・アトミック）*/
    private CompletableFuture<Boolean> seedIfAbsent(String key, Object value, Duration ttl) {
        return CompletableFuture.supplyAsync(() -> {
            boolean set = redissonClient.<Object>getBucket(key).setIfAbsent(value, ttl);
            if (!set) {
                logger.debug("シードスキップ（既存キー）: {}", key);
            }
            return true;
        }, virtualExecutor);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void seedDemoData() {
        logger.info("デモキャッシュデータを投入中...");
        try {
            List<CompletableFuture<Boolean>> futures = List.of(
                seedIfAbsent("demo:user:alice",
                        Map.of("name", "Alice", "role", "admin", "age", 30, "email", "alice@example.com"),
                        Duration.ofDays(7)),
                seedIfAbsent("demo:user:bob",
                        Map.of("name", "Bob", "role", "viewer", "age", 25, "email", "bob@example.com"),
                        Duration.ofDays(7)),
                seedIfAbsent("demo:greeting", "Hello, Redis!", Duration.ofDays(7)),
                seedIfAbsent("demo:counter", 42, Duration.ofDays(7)),
                seedIfAbsent("demo:config",
                        Map.of("version", "1.0.0", "env", "docker", "debug", false, "maxConnections", 100),
                        Duration.ofDays(7)),
                seedIfAbsent("demo:session:token-abc",
                        Map.of("userId", "alice", "expires", System.currentTimeMillis() + 3600_000, "ip", "192.168.1.1"),
                        Duration.ofHours(1)),
                // 送金デモ用残高
                seedIfAbsent("balance:account:A", 1000.0, Duration.ofDays(7)),
                seedIfAbsent("balance:account:B", 500.0, Duration.ofDays(7))
            );

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            long failed = futures.stream().filter(f -> !Boolean.TRUE.equals(f.join())).count();
            if (failed > 0) {
                logger.warn("デモデータ投入: {} 件が失敗", failed);
            } else {
                logger.info("デモキャッシュデータの投入完了");
            }
        } catch (Exception e) {
            logger.warn("デモデータ投入に失敗 (Redis 未接続の可能性)", e);
        }
    }
}
