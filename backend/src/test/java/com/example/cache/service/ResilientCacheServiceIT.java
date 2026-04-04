package com.example.cache.service;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class ResilientCacheServiceIT {

    @Container
    static GenericContainer<?> redis =
            new GenericContainer<>("redis:alpine").withExposedPorts(6379);

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry r) {
        r.add("REDIS_HOST", redis::getHost);
        r.add("REDIS_PORT", () -> redis.getMappedPort(6379).toString());
        r.add("REDIS_PASSWORD", () -> "");
    }

    @Autowired
    ResilientCacheService cacheService;

    @Autowired
    CircuitBreakerRegistry circuitBreakerRegistry;

    @BeforeEach
    void setUp() {
        cacheService.getMetrics().reset();
        cacheService.setSimulateError(false);
        circuitBreakerRegistry.circuitBreaker("cache-operations").reset();
    }

    @Test
    void setAsync_and_get_roundTrip_string() throws Exception {
        cacheService.setAsync("test:str", "hello", Duration.ofMinutes(5)).get();
        Optional<String> result = cacheService.get("test:str", String.class, null);
        assertThat(result).isPresent().contains("hello");
    }

    @Test
    void setAsync_and_get_roundTrip_integer() throws Exception {
        cacheService.setAsync("test:int", 42, Duration.ofMinutes(5)).get();
        Optional<Object> result = cacheService.get("test:int", Object.class, null);
        assertThat(result).isPresent();
    }

    @Test
    void delete_removesKey() throws Exception {
        cacheService.setAsync("test:del", "bye", Duration.ofMinutes(1)).get();
        boolean deleted = cacheService.delete("test:del");
        assertThat(deleted).isTrue();

        Optional<String> after = cacheService.get("test:del", String.class, null);
        assertThat(after).isEmpty();
    }

    @Test
    void getBatch_returnsOnlyPresentKeys() throws Exception {
        cacheService.setAsync("batch:a", "valA", Duration.ofMinutes(5)).get();
        cacheService.setAsync("batch:b", "valB", Duration.ofMinutes(5)).get();

        Map<String, Object> results = cacheService.getBatch(Set.of("batch:a", "batch:b", "batch:missing"));
        assertThat(results).containsKey("batch:a").containsKey("batch:b");
        assertThat(results).doesNotContainKey("batch:missing");
    }

    @Test
    void searchKeys_withPattern_matchesKeys() throws Exception {
        cacheService.setAsync("search:x:1", "v1", Duration.ofMinutes(5)).get();
        cacheService.setAsync("search:x:2", "v2", Duration.ofMinutes(5)).get();

        Set<String> keys = cacheService.searchKeys("search:x:*", 100);
        assertThat(keys).contains("search:x:1", "search:x:2");
    }

    @Test
    void isHealthy_withRedisRunning_returnsTrue() {
        assertThat(cacheService.isHealthy()).isTrue();
    }

    @Test
    void getMetrics_recordsOperations() throws Exception {
        cacheService.getMetrics().reset();
        cacheService.setAsync("metrics:test", "v", Duration.ofMinutes(1)).get();
        cacheService.get("metrics:test", String.class, null);

        Map<String, Long> metricsMap = cacheService.getMetrics().toMap();
        assertThat(metricsMap.get("operations")).isGreaterThanOrEqualTo(2L);
    }

    @Test
    void warmUp_completesWithoutError() throws Exception {
        cacheService.setAsync("warmup:1", "v1", Duration.ofMinutes(5)).get();
        cacheService.setAsync("warmup:2", "v2", Duration.ofMinutes(5)).get();

        cacheService.warmUp(Set.of("warmup:1", "warmup:2")).get();
        // No exception = success
    }

    @Test
    void cacheMetrics_hitRateCalculation() throws Exception {
        var metrics = new ResilientCacheService.CacheMetrics();
        for (int i = 0; i < 10; i++) metrics.recordOperation("get");
        for (int i = 0; i < 7; i++) metrics.recordRedisHit();

        Map<String, Long> map = metrics.toMap();
        assertThat(map.get("hitRate")).isEqualTo(70L);
    }

    // --- Circuit Breaker lifecycle tests ---

    /**
     * simulateError が投げる RuntimeException はフォールバック対象外のため、
     * get() は例外を伝播する。CB は失敗として記録し OPEN に遷移する。
     */
    private void triggerCircuitBreakerOpen(int calls) {
        cacheService.setSimulateError(true);
        for (int i = 0; i < calls; i++) {
            try {
                cacheService.get("cb-trip:" + i, String.class, null);
            } catch (RuntimeException ignored) {
                // CB に失敗を記録させるため、例外を握りつぶす
            }
        }
    }

    @Test
    void circuitBreaker_opensAfterRepeatedFailures() {
        CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("cache-operations");

        // minimum-number-of-calls=3, failure-rate-threshold=60%
        triggerCircuitBreakerOpen(3);

        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);
    }

    @Test
    void circuitBreaker_returnsFallbackWhenOpen() throws Exception {
        CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("cache-operations");

        // テストデータをセット
        cacheService.setAsync("cb-fallback:key", "real-value", Duration.ofMinutes(5)).get();

        // CB を OPEN にする
        triggerCircuitBreakerOpen(3);
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);

        // OPEN 状態では CallNotPermittedException → fallback が返る
        cacheService.setSimulateError(false);
        Optional<String> result = cacheService.get("cb-fallback:key", String.class,
                () -> "fallback-value");
        assertThat(result).isPresent().contains("fallback-value");
    }

    @Test
    void circuitBreaker_recoversFromOpenToClosedViaHalfOpen() throws Exception {
        CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("cache-operations");

        // テストデータをセット
        cacheService.setAsync("cb-recover:key", "ok", Duration.ofMinutes(5)).get();

        // CB を OPEN にする
        triggerCircuitBreakerOpen(3);
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);

        // エラー注入を解除し、HALF_OPEN への遷移を待つ（wait-duration-in-open-state=5s）
        cacheService.setSimulateError(false);
        Thread.sleep(6_000);

        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.HALF_OPEN);

        // HALF_OPEN で permitted-number-of-calls-in-half-open-state=3 回成功させる
        for (int i = 0; i < 3; i++) {
            Optional<String> probe = cacheService.get("cb-recover:key", String.class, null);
            assertThat(probe).isPresent().contains("ok");
        }

        // CB が CLOSED に復旧
        assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }
}
