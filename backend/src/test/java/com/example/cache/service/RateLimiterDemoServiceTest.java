package com.example.cache.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RateLimiterDemoServiceTest {

    @Mock
    DistributedRateLimiterService distributedRateLimiter;

    @InjectMocks
    RateLimiterDemoService rateLimiterDemoService;

    @Test
    void getRateLimiterStatus_returnsAllFields() {
        var status = new DistributedRateLimiterService.Status(10L, 100L, 1000L);
        when(distributedRateLimiter.getStatus()).thenReturn(status);

        RateLimiterDemoService.RateLimiterStatus result = rateLimiterDemoService.getRateLimiterStatus();

        assertThat(result.availablePermissions()).isEqualTo(10);
        assertThat(result.numberOfWaitingThreads()).isEqualTo(0);
        assertThat(result.cyclePeriodMs()).isEqualTo(1000L);
        assertThat(result.limitForPeriod()).isEqualTo(100);
    }

    @Test
    void executeFlood_permittedPlusRejectedEqualsTotal() {
        // Allow all permissions
        when(distributedRateLimiter.tryAcquire()).thenReturn(true);

        var result = rateLimiterDemoService.executeFlood(3, 2);

        assertThat(result.requested()).isEqualTo(6);
        assertThat(result.permitted() + result.rejected()).isEqualTo(6);
        assertThat(result.events()).hasSize(6);
    }

    @Test
    void executeFlood_someRejected_sumStillEqualsTotal() {
        // Alternate permit/deny
        when(distributedRateLimiter.tryAcquire())
                .thenReturn(true, false, true, false, true, false);

        var result = rateLimiterDemoService.executeFlood(3, 2);

        assertThat(result.requested()).isEqualTo(6);
        assertThat(result.permitted() + result.rejected()).isEqualTo(6);
    }

    @Test
    void executeFlood_allRejected_permittedIsZero() {
        when(distributedRateLimiter.tryAcquire()).thenReturn(false);

        var result = rateLimiterDemoService.executeFlood(2, 3);

        assertThat(result.requested()).isEqualTo(6);
        assertThat(result.permitted()).isEqualTo(0);
        assertThat(result.rejected()).isEqualTo(6);
    }
}
