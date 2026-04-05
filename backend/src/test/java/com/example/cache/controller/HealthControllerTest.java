package com.example.cache.controller;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.Test;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Set;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(HealthController.class)
@AutoConfigureMockMvc(addFilters = false)
class HealthControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    RedissonClient redissonClient;

    @MockitoBean
    CircuitBreakerRegistry circuitBreakerRegistry;

    @SuppressWarnings("unchecked") // Mockito.mock(Class) returns raw type; generic assignment is safe in test stubs
    @Test
    void health_redisUp_returns200WithStatusUp() throws Exception {
        when(redissonClient.isShutdown()).thenReturn(false);

        RBucket<Object> pingBucket = mock(RBucket.class);
        when(pingBucket.isExists()).thenReturn(true);
        when(redissonClient.getBucket("health-check-ping")).thenReturn(pingBucket);

        CircuitBreaker cb = mock(CircuitBreaker.class);
        when(cb.getName()).thenReturn("cache-operations");
        when(cb.getState()).thenReturn(CircuitBreaker.State.CLOSED);

        CircuitBreaker.Metrics cbMetrics = mock(CircuitBreaker.Metrics.class);
        when(cbMetrics.getFailureRate()).thenReturn(0.0f);
        when(cbMetrics.getSlowCallRate()).thenReturn(0.0f);
        when(cbMetrics.getNumberOfSuccessfulCalls()).thenReturn(10);
        when(cbMetrics.getNumberOfFailedCalls()).thenReturn(0);
        when(cbMetrics.getNumberOfSlowCalls()).thenReturn(0);
        when(cb.getMetrics()).thenReturn(cbMetrics);

        when(circuitBreakerRegistry.getAllCircuitBreakers()).thenReturn(Set.of(cb));

        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.redis.status").value("UP"));
    }

    @SuppressWarnings("unchecked")
    @Test
    void health_redisDown_returns503WithStatusDegraded() throws Exception {
        when(redissonClient.isShutdown()).thenReturn(false);

        RBucket<Object> pingBucket = mock(RBucket.class);
        when(pingBucket.isExists()).thenThrow(new RuntimeException("connection refused"));
        when(redissonClient.getBucket("health-check-ping")).thenReturn(pingBucket);

        when(circuitBreakerRegistry.getAllCircuitBreakers()).thenReturn(Set.of());

        mockMvc.perform(get("/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("DEGRADED"))
                .andExpect(jsonPath("$.redis.status").value("DOWN"));
    }

    @Test
    void health_redissonShutdown_returns503WithDegraded() throws Exception {
        when(redissonClient.isShutdown()).thenReturn(true);

        mockMvc.perform(get("/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("DEGRADED"))
                .andExpect(jsonPath("$.redis.initialized").value(false));
    }

    @SuppressWarnings("unchecked")
    @Test
    void health_circuitBreakerMetrics_includedInResponse() throws Exception {
        when(redissonClient.isShutdown()).thenReturn(false);

        RBucket<Object> pingBucket = mock(RBucket.class);
        when(pingBucket.isExists()).thenReturn(true);
        when(redissonClient.getBucket("health-check-ping")).thenReturn(pingBucket);

        CircuitBreaker cb = mock(CircuitBreaker.class);
        when(cb.getName()).thenReturn("cache-operations");
        when(cb.getState()).thenReturn(CircuitBreaker.State.HALF_OPEN);

        CircuitBreaker.Metrics cbMetrics = mock(CircuitBreaker.Metrics.class);
        when(cbMetrics.getFailureRate()).thenReturn(55.0f);
        when(cbMetrics.getSlowCallRate()).thenReturn(10.0f);
        when(cbMetrics.getNumberOfSuccessfulCalls()).thenReturn(5);
        when(cbMetrics.getNumberOfFailedCalls()).thenReturn(3);
        when(cbMetrics.getNumberOfSlowCalls()).thenReturn(1);
        when(cb.getMetrics()).thenReturn(cbMetrics);

        when(circuitBreakerRegistry.getAllCircuitBreakers()).thenReturn(Set.of(cb));

        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.circuitBreakers['cache-operations'].state").value("HALF_OPEN"))
                .andExpect(jsonPath("$.circuitBreakers['cache-operations'].failureRate").value(55.0));
    }
}
