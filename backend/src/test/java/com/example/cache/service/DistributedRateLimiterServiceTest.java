package com.example.cache.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateType;
import org.redisson.api.RateLimiterConfig;
import org.redisson.api.RedissonClient;

import java.time.Duration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for DistributedRateLimiterService.
 * Does NOT require a running Redis instance.
 */
@ExtendWith(MockitoExtension.class)
class DistributedRateLimiterServiceTest {

    @Mock
    RedissonClient redissonClient;

    @Mock
    RRateLimiter rRateLimiter;

    @Mock
    RateLimiterConfig rateLimiterConfig;

    private DistributedRateLimiterService service;

    @BeforeEach
    void setUp() {
        when(redissonClient.getRateLimiter("cache-operations")).thenReturn(rRateLimiter);
        when(rRateLimiter.trySetRate(eq(RateType.OVERALL), eq(100L), any(Duration.class))).thenReturn(true);

        service = new DistributedRateLimiterService(redissonClient, 100L, 1L);
    }

    // ----------------------------------------------------------------
    // tryAcquire()
    // ----------------------------------------------------------------

    @Test
    void tryAcquire_permitAvailable_returnsTrue() {
        when(rRateLimiter.tryAcquire()).thenReturn(true);

        boolean result = service.tryAcquire();

        assertThat(result).isTrue();
    }

    @Test
    void tryAcquire_rateLimitExceeded_returnsFalse() {
        when(rRateLimiter.tryAcquire()).thenReturn(false);

        boolean result = service.tryAcquire();

        assertThat(result).isFalse();
    }

    @Test
    void tryAcquire_redisThrowsException_failOpenReturnsTrue() {
        when(rRateLimiter.tryAcquire()).thenThrow(new RuntimeException("Redis connection refused"));

        boolean result = service.tryAcquire();

        // Fail-open: Redis errors should NOT block requests
        assertThat(result).isTrue();
    }

    // ----------------------------------------------------------------
    // getStatus()
    // ----------------------------------------------------------------

    @Test
    void getStatus_returnsCorrectValues() {
        when(rRateLimiter.getConfig()).thenReturn(rateLimiterConfig);
        when(rateLimiterConfig.getRate()).thenReturn(100L);
        when(rateLimiterConfig.getRateInterval()).thenReturn(1000L);
        when(rRateLimiter.availablePermits()).thenReturn(75L);

        DistributedRateLimiterService.Status status = service.getStatus();

        assertThat(status.availablePermits()).isEqualTo(75L);
        assertThat(status.rate()).isEqualTo(100L);
        assertThat(status.intervalMs()).isEqualTo(1000L);
    }

    @Test
    void getStatus_redisThrowsException_returnsNegativeValues() {
        when(rRateLimiter.getConfig()).thenThrow(new RuntimeException("Redis unavailable"));

        DistributedRateLimiterService.Status status = service.getStatus();

        // Graceful degradation on Redis error
        assertThat(status.availablePermits()).isEqualTo(-1L);
        assertThat(status.rate()).isEqualTo(-1L);
        assertThat(status.intervalMs()).isEqualTo(-1L);
    }

    // ----------------------------------------------------------------
    // Constructor — initialization
    // ----------------------------------------------------------------

    @Test
    void constructor_trySetRateFailsGracefully() {
        // If trySetRate throws (Redis not ready), construction should still succeed
        when(rRateLimiter.trySetRate(any(RateType.class), anyLong(), any(Duration.class)))
                .thenThrow(new RuntimeException("Redis not available"));

        // Should not throw
        assertThatCode(() -> new DistributedRateLimiterService(redissonClient, 50L, 2L))
                .doesNotThrowAnyException();
    }
}
