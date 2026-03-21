package com.example.cache.service;

import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.ratelimiter.RateLimiterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RateLimiterDemoServiceTest {

    @Mock
    RateLimiterRegistry rateLimiterRegistry;

    @InjectMocks
    RateLimiterDemoService rateLimiterDemoService;

    @Mock
    RateLimiter rateLimiter;

    @Mock
    RateLimiter.Metrics rateLimiterMetrics;

    @BeforeEach
    void setUp() {
        when(rateLimiterRegistry.rateLimiter("default")).thenReturn(rateLimiter);
        // lenient: getMetrics and getRateLimiterConfig are not used by executeFlood tests
        lenient().when(rateLimiter.getMetrics()).thenReturn(rateLimiterMetrics);

        RateLimiterConfig config = RateLimiterConfig.custom()
                .limitForPeriod(100)
                .limitRefreshPeriod(Duration.ofSeconds(1))
                .timeoutDuration(Duration.ofMillis(100))
                .build();
        lenient().when(rateLimiter.getRateLimiterConfig()).thenReturn(config);
    }

    @Test
    void getRateLimiterStatus_returnsAllFields() {
        when(rateLimiterMetrics.getAvailablePermissions()).thenReturn(10);
        when(rateLimiterMetrics.getNumberOfWaitingThreads()).thenReturn(2);

        RateLimiterDemoService.RateLimiterStatus status = rateLimiterDemoService.getRateLimiterStatus();

        assertThat(status.availablePermissions()).isEqualTo(10);
        assertThat(status.numberOfWaitingThreads()).isEqualTo(2);
        assertThat(status.cyclePeriodMs()).isEqualTo(1000L);
        assertThat(status.limitForPeriod()).isEqualTo(100);
    }

    @Test
    void executeFlood_permittedPlusRejectedEqualsTotal() {
        // Allow all permissions
        when(rateLimiter.acquirePermission()).thenReturn(true);

        var result = rateLimiterDemoService.executeFlood(3, 2);

        assertThat(result.requested()).isEqualTo(6);
        assertThat(result.permitted() + result.rejected()).isEqualTo(6);
        assertThat(result.events()).hasSize(6);
    }

    @Test
    void executeFlood_someRejected_sumStillEqualsTotal() {
        // Alternate permit/deny
        when(rateLimiter.acquirePermission())
                .thenReturn(true, false, true, false, true, false);

        var result = rateLimiterDemoService.executeFlood(3, 2);

        assertThat(result.requested()).isEqualTo(6);
        assertThat(result.permitted() + result.rejected()).isEqualTo(6);
    }
}
