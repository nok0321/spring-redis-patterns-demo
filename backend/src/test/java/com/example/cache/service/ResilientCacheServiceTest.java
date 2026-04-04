package com.example.cache.service;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.retry.RetryRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBucket;
import org.redisson.api.RFuture;
import org.redisson.api.RKeys;
import org.redisson.api.RedissonClient;
import org.redisson.api.options.KeysScanParams;

import org.redisson.client.RedisConnectionException;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for ResilientCacheService using mocked Redis and real Resilience4j registries.
 * Does NOT require a running Redis instance.
 */
@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked")
class ResilientCacheServiceTest {

    @Mock
    RedissonClient redissonClient;

    @Mock
    RBucket<Object> bucket;

    @Mock
    DistributedRateLimiterService distributedRateLimiter;

    private ResilientCacheService service;
    private CircuitBreakerRegistry circuitBreakerRegistry;
    private RetryRegistry retryRegistry;
    private ExecutorService executor;

    @BeforeEach
    void setUp() {
        // Use permissive Resilience4j configs so unit tests don't trip circuit breakers
        circuitBreakerRegistry = CircuitBreakerRegistry.of(
                CircuitBreakerConfig.custom()
                        .slidingWindowSize(100)
                        .failureRateThreshold(100)
                        .build());

        retryRegistry = RetryRegistry.of(
                RetryConfig.custom()
                        .maxAttempts(1)
                        .build());

        // Allow all requests through by default (lenient: not all tests invoke rate-limited methods)
        lenient().when(distributedRateLimiter.tryAcquire()).thenReturn(true);

        executor = Executors.newVirtualThreadPerTaskExecutor();

        service = new ResilientCacheService(
                redissonClient,
                circuitBreakerRegistry,
                retryRegistry,
                distributedRateLimiter,
                executor);
    }

    // ----------------------------------------------------------------
    // get()
    // ----------------------------------------------------------------

    @Test
    void get_keyExists_returnsValue() {
        when(redissonClient.<Object>getBucket("mykey")).thenReturn((RBucket) bucket);
        when(bucket.get()).thenReturn("hello");

        Optional<String> result = service.get("mykey", String.class, null);

        assertThat(result).contains("hello");
    }

    @Test
    void get_keyNotExists_returnsEmpty() {
        when(redissonClient.<Object>getBucket("missing")).thenReturn((RBucket) bucket);
        when(bucket.get()).thenReturn(null);

        Optional<String> result = service.get("missing", String.class, null);

        assertThat(result).isEmpty();
    }

    @Test
    void get_withFallbackSupplier_usedWhenRedisThrows() {
        when(redissonClient.<Object>getBucket("anykey")).thenReturn((RBucket) bucket);
        when(bucket.get()).thenThrow(new RedisConnectionException("connection refused"));

        Optional<String> result = service.get("anykey", String.class, () -> "fallback-value");

        assertThat(result).contains("fallback-value");
    }

    @Test
    void get_withNullFallback_returnsEmptyWhenRedisThrows() {
        when(redissonClient.<Object>getBucket("anykey")).thenReturn((RBucket) bucket);
        when(bucket.get()).thenThrow(new RedisConnectionException("connection refused"));

        Optional<String> result = service.get("anykey", String.class, null);

        assertThat(result).isEmpty();
    }

    @Test
    void get_fallbackSupplierThrows_returnsEmpty() {
        when(redissonClient.<Object>getBucket("anykey")).thenReturn((RBucket) bucket);
        when(bucket.get()).thenThrow(new RedisConnectionException("connection refused"));

        Optional<String> result = service.get("anykey", String.class, () -> {
            throw new RuntimeException("fallback also failed");
        });

        assertThat(result).isEmpty();
    }

    // ----------------------------------------------------------------
    // setAsync()
    // ----------------------------------------------------------------

    @Test
    void setAsync_success_returnsTrue() throws Exception {
        when(redissonClient.<Object>getBucket("k1")).thenReturn((RBucket) bucket);
        doNothing().when(bucket).set(eq("value"), any(Duration.class));

        boolean result = service.setAsync("k1", "value", Duration.ofHours(1)).get(5, TimeUnit.SECONDS);

        assertThat(result).isTrue();
    }

    @Test
    void setAsync_withNullTtl_usesBucketSetWithoutTtl() throws Exception {
        when(redissonClient.<Object>getBucket("k1")).thenReturn((RBucket) bucket);
        doNothing().when(bucket).set(eq("value"));

        boolean result = service.setAsync("k1", "value", null).get(5, TimeUnit.SECONDS);

        assertThat(result).isTrue();
        verify(bucket).set("value");
    }

    @Test
    void setAsync_withZeroTtl_usesBucketSetWithoutTtl() throws Exception {
        when(redissonClient.<Object>getBucket("k1")).thenReturn((RBucket) bucket);
        doNothing().when(bucket).set(eq("val"));

        boolean result = service.setAsync("k1", "val", Duration.ZERO).get(5, TimeUnit.SECONDS);

        assertThat(result).isTrue();
        verify(bucket).set("val");
    }

    // ----------------------------------------------------------------
    // delete()
    // ----------------------------------------------------------------

    @Test
    void delete_keyExists_returnsTrue() {
        when(redissonClient.<Object>getBucket("k1")).thenReturn((RBucket) bucket);
        when(bucket.delete()).thenReturn(true);

        boolean result = service.delete("k1");

        assertThat(result).isTrue();
    }

    @Test
    void delete_keyNotExists_returnsFalse() {
        when(redissonClient.<Object>getBucket("k1")).thenReturn((RBucket) bucket);
        when(bucket.delete()).thenReturn(false);

        boolean result = service.delete("k1");

        assertThat(result).isFalse();
    }

    // ----------------------------------------------------------------
    // getBatch()
    // ----------------------------------------------------------------

    @Test
    void getBatch_allKeysFound_returnsAllValues() throws Exception {
        RBucket<Object> b1 = mock(RBucket.class);
        RBucket<Object> b2 = mock(RBucket.class);
        RFuture<Object> f1 = mock(RFuture.class);
        RFuture<Object> f2 = mock(RFuture.class);

        when(redissonClient.<Object>getBucket("k1")).thenReturn(b1);
        when(redissonClient.<Object>getBucket("k2")).thenReturn(b2);
        when(b1.getAsync()).thenReturn(f1);
        when(b2.getAsync()).thenReturn(f2);
        when(f1.get()).thenReturn("v1");
        when(f2.get()).thenReturn("v2");

        Map<String, Object> result = service.getBatch(Set.of("k1", "k2"));

        assertThat(result).containsKeys("k1", "k2");
        assertThat(result.get("k1")).isEqualTo("v1");
        assertThat(result.get("k2")).isEqualTo("v2");
    }

    @Test
    void getBatch_someKeysNull_excludesNullValues() throws Exception {
        RBucket<Object> b1 = mock(RBucket.class);
        RBucket<Object> b2 = mock(RBucket.class);
        RFuture<Object> f1 = mock(RFuture.class);
        RFuture<Object> f2 = mock(RFuture.class);

        when(redissonClient.<Object>getBucket("k1")).thenReturn(b1);
        when(redissonClient.<Object>getBucket("k2")).thenReturn(b2);
        when(b1.getAsync()).thenReturn(f1);
        when(b2.getAsync()).thenReturn(f2);
        when(f1.get()).thenReturn("v1");
        when(f2.get()).thenReturn(null); // cache miss

        Map<String, Object> result = service.getBatch(Set.of("k1", "k2"));

        assertThat(result).containsKey("k1");
        assertThat(result).doesNotContainKey("k2");
    }

    @Test
    void getBatch_futureThrows_skipsErrorKey() throws Exception {
        RBucket<Object> b1 = mock(RBucket.class);
        RFuture<Object> f1 = mock(RFuture.class);

        when(redissonClient.<Object>getBucket("k1")).thenReturn(b1);
        when(b1.getAsync()).thenReturn(f1);
        when(f1.get()).thenThrow(new RuntimeException("WRONGTYPE error"));

        Map<String, Object> result = service.getBatch(Set.of("k1"));

        assertThat(result).isEmpty();
    }

    // ----------------------------------------------------------------
    // searchKeys()
    // ----------------------------------------------------------------

    @Test
    void searchKeys_matchingPattern_returnsKeys() {
        RKeys rKeys = mock(RKeys.class);
        when(redissonClient.getKeys()).thenReturn(rKeys);
        when(rKeys.getKeysStream(any(KeysScanParams.class)))
                .thenReturn(Stream.of("user:1", "user:2", "user:3"));

        Set<String> result = service.searchKeys("user:*", 100);

        assertThat(result).containsExactlyInAnyOrder("user:1", "user:2", "user:3");
    }

    @Test
    void searchKeys_redissonInternalKeys_areFiltered() {
        RKeys rKeys = mock(RKeys.class);
        when(redissonClient.getKeys()).thenReturn(rKeys);
        when(rKeys.getKeysStream(any(KeysScanParams.class)))
                .thenReturn(Stream.of("user:1", "redisson_unlock_latch:abc", "user:2"));

        Set<String> result = service.searchKeys("*", 100);

        assertThat(result).containsExactlyInAnyOrder("user:1", "user:2");
        assertThat(result).noneMatch(k -> k.startsWith("redisson_"));
    }

    @Test
    void searchKeys_noMatches_returnsEmptySet() {
        RKeys rKeys = mock(RKeys.class);
        when(redissonClient.getKeys()).thenReturn(rKeys);
        when(rKeys.getKeysStream(any(KeysScanParams.class)))
                .thenReturn(Stream.empty());

        Set<String> result = service.searchKeys("no-match:*", 100);

        assertThat(result).isEmpty();
    }

    // ----------------------------------------------------------------
    // isHealthy()
    // ----------------------------------------------------------------

    @Test
    void isHealthy_redisResponsive_returnsTrue() {
        when(redissonClient.getBucket("health-check-ping")).thenReturn((RBucket) bucket);
        when(bucket.isExists()).thenReturn(true);

        boolean healthy = service.isHealthy();

        assertThat(healthy).isTrue();
    }

    @Test
    void isHealthy_redisThrows_returnsFalse() {
        when(redissonClient.getBucket("health-check-ping"))
                .thenThrow(new RuntimeException("connection refused"));

        boolean healthy = service.isHealthy();

        assertThat(healthy).isFalse();
    }

    @Test
    void isHealthy_circuitBreakerOpen_returnsFalse() {
        when(redissonClient.getBucket("health-check-ping")).thenReturn((RBucket) bucket);
        when(bucket.isExists()).thenReturn(true);

        // Force circuit breaker to OPEN state
        CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("cache-operations");
        cb.transitionToOpenState();

        boolean healthy = service.isHealthy();

        assertThat(healthy).isFalse();

        // Cleanup
        cb.transitionToClosedState();
    }

    // ----------------------------------------------------------------
    // setSimulateError() / isSimulateError()
    // ----------------------------------------------------------------

    @Test
    void setSimulateError_true_flagIsSet() {
        service.setSimulateError(true);
        assertThat(service.isSimulateError()).isTrue();
    }

    @Test
    void setSimulateError_false_flagIsCleared() {
        service.setSimulateError(true);
        service.setSimulateError(false);
        assertThat(service.isSimulateError()).isFalse();
    }

    // ----------------------------------------------------------------
    // getMetrics() / CacheMetrics
    // ----------------------------------------------------------------

    @Test
    void getMetrics_returnsNonNull() {
        assertThat(service.getMetrics()).isNotNull();
    }

    @Test
    void cacheMetrics_recordAndRead() {
        ResilientCacheService.CacheMetrics metrics = new ResilientCacheService.CacheMetrics();

        metrics.recordOperation();
        metrics.recordOperation();
        metrics.recordRedisHit();
        metrics.recordFallback();
        metrics.recordError();

        Map<String, Long> map = metrics.toMap();
        assertThat(map.get("operations")).isEqualTo(2L);
        assertThat(map.get("redisHits")).isEqualTo(1L);
        assertThat(map.get("fallbacks")).isEqualTo(1L);
        assertThat(map.get("errors")).isEqualTo(1L);
        assertThat(map.get("hitRate")).isEqualTo(50L); // 1 hit / 2 ops
    }

    @Test
    void cacheMetrics_reset_clearsAllCounters() {
        ResilientCacheService.CacheMetrics metrics = new ResilientCacheService.CacheMetrics();
        metrics.recordOperation();
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
    void cacheMetrics_hitRateZeroOps_returnsZero() {
        ResilientCacheService.CacheMetrics metrics = new ResilientCacheService.CacheMetrics();
        assertThat(metrics.getHitRate()).isEqualTo(0L);
    }

    @Test
    void cacheMetrics_toString_containsStats() {
        ResilientCacheService.CacheMetrics metrics = new ResilientCacheService.CacheMetrics();
        metrics.recordOperation();
        metrics.recordRedisHit();

        String str = metrics.toString();
        assertThat(str).contains("CacheMetrics");
        assertThat(str).contains("operations=1");
        assertThat(str).contains("redisHits=1");
    }

    // ----------------------------------------------------------------
    // warmUp()
    // ----------------------------------------------------------------

    @Test
    void warmUp_keysPresent_completesWithoutError() throws Exception {
        when(redissonClient.<Object>getBucket(anyString())).thenReturn((RBucket) bucket);
        when(bucket.get()).thenReturn("cached-value");

        service.warmUp(Set.of("k1", "k2")).get(5, TimeUnit.SECONDS);

        verify(bucket, atLeast(2)).get();
    }

    @Test
    void warmUp_emptyKeys_completesImmediately() throws Exception {
        // Should not throw
        service.warmUp(Set.of()).get(5, TimeUnit.SECONDS);
        verifyNoInteractions(redissonClient);
    }

}
