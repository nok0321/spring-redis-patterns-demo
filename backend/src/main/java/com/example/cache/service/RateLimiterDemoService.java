package com.example.cache.service;

import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import io.github.resilience4j.ratelimiter.RequestNotPermitted;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Rate Limiter デモサービス
 * トークンバケットアルゴリズムの動作をシミュレートする
 */
@Service
public class RateLimiterDemoService {

    private static final Logger logger = LoggerFactory.getLogger(RateLimiterDemoService.class);

    private final RateLimiterRegistry rateLimiterRegistry;

    public RateLimiterDemoService(RateLimiterRegistry rateLimiterRegistry) {
        this.rateLimiterRegistry = rateLimiterRegistry;
    }

    public record FloodEvent(int workerId, boolean permitted, long relativeMs) {}

    public record FloodResult(int requested, int permitted, int rejected, List<FloodEvent> events) {}

    /**
     * Rate Limiter の現在のステータスを取得する
     */
    public record RateLimiterStatus(
        int availablePermissions,
        int numberOfWaitingThreads,
        long cyclePeriodMs,
        int limitForPeriod
    ) {}

    public RateLimiterStatus getRateLimiterStatus() {
        RateLimiter rl = rateLimiterRegistry.rateLimiter("default");
        RateLimiter.Metrics metrics = rl.getMetrics();
        return new RateLimiterStatus(
            metrics.getAvailablePermissions(),
            metrics.getNumberOfWaitingThreads(),
            rl.getRateLimiterConfig().getLimitRefreshPeriod().toMillis(),
            rl.getRateLimiterConfig().getLimitForPeriod()
        );
    }

    /**
     * 大量リクエストを一斉に送りパーミッション取得成功/失敗を記録する
     *
     * @param workers    並行ワーカー数
     * @param burstCount 各ワーカーが発行するリクエスト数
     */
    public FloodResult executeFlood(int workers, int burstCount) {
        RateLimiter rl = rateLimiterRegistry.rateLimiter("default");
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
                        boolean ok;
                        try {
                            ok = rl.acquirePermission();
                        } catch (RequestNotPermitted e) {
                            ok = false;
                        }
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
