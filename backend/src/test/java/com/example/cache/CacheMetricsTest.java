package com.example.cache;

import com.example.cache.service.ResilientCacheService;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;

import static org.assertj.core.api.Assertions.*;

class CacheMetricsTest {

    @Test
    void recordOperation_incrementsCount() {
        var metrics = new ResilientCacheService.CacheMetrics();
        metrics.recordOperation("get");
        metrics.recordOperation("set");

        Map<String, Long> map = metrics.toMap();
        assertThat(map.get("operations")).isEqualTo(2L);
    }

    @Test
    void recordRedisHit_incrementsCount() {
        var metrics = new ResilientCacheService.CacheMetrics();
        metrics.recordRedisHit();
        metrics.recordRedisHit();
        metrics.recordRedisHit();

        assertThat(metrics.toMap().get("redisHits")).isEqualTo(3L);
    }

    @Test
    void toMap_hitRateCalculation_correct() {
        var metrics = new ResilientCacheService.CacheMetrics();
        for (int i = 0; i < 10; i++) metrics.recordOperation("get");
        for (int i = 0; i < 7; i++) metrics.recordRedisHit();

        Map<String, Long> map = metrics.toMap();
        assertThat(map.get("hitRate")).isEqualTo(70L);
    }

    @Test
    void toMap_zeroOps_hitRateIsZero() {
        var metrics = new ResilientCacheService.CacheMetrics();

        Map<String, Long> map = metrics.toMap();
        assertThat(map.get("hitRate")).isEqualTo(0L);
        assertThat(map.get("operations")).isEqualTo(0L);
    }

    @Test
    void reset_clearsAllCounters() {
        var metrics = new ResilientCacheService.CacheMetrics();
        metrics.recordOperation("get");
        metrics.recordRedisHit();
        metrics.recordFallback();
        metrics.recordError();

        metrics.reset();

        Map<String, Long> map = metrics.toMap();
        assertThat(map.get("operations")).isEqualTo(0L);
        assertThat(map.get("redisHits")).isEqualTo(0L);
        assertThat(map.get("fallbacks")).isEqualTo(0L);
        assertThat(map.get("errors")).isEqualTo(0L);
    }

    @Test
    void toString_includesAllFields() {
        var metrics = new ResilientCacheService.CacheMetrics();
        metrics.recordOperation("get");

        String str = metrics.toString();
        assertThat(str).contains("operations=1");
    }

    @Test
    void concurrent_increment_noLoss() throws Exception {
        var metrics = new ResilientCacheService.CacheMetrics();
        int threads = 100;
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);

        List<Thread> threadList = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Thread t = Thread.ofVirtual().start(() -> {
                try {
                    ready.countDown();
                    go.await();
                    metrics.recordOperation("get");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
            threadList.add(t);
        }

        ready.await();
        go.countDown();
        done.await();

        assertThat(metrics.toMap().get("operations")).isEqualTo((long) threads);
    }
}
