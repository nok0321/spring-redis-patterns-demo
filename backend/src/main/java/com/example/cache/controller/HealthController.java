package com.example.cache.controller;

import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Tag(name = "Health", description = "サービス死活確認・Redis 接続状態・サーキットブレーカーメトリクス")
@RestController
@RequestMapping("/health")
public class HealthController {

    private static final Logger logger = LoggerFactory.getLogger(HealthController.class);

    private final RedissonClient redissonClient;
    private final CircuitBreakerRegistry circuitBreakerRegistry;

    public HealthController(RedissonClient redissonClient,
                            CircuitBreakerRegistry circuitBreakerRegistry) {
        this.redissonClient = redissonClient;
        this.circuitBreakerRegistry = circuitBreakerRegistry;
    }

    @Operation(summary = "ヘルスチェック", description = "Redis 接続状態と全サーキットブレーカーのメトリクスを返す")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "正常（status=UP）"),
        @ApiResponse(responseCode = "503", description = "Redis 接続異常（status=DEGRADED）")
    })
    @GetMapping
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("timestamp", Instant.now().toString());
        health.put("service", "Cache Service");

        if (redissonClient.isShutdown()) {
            health.put("redis", Map.of("initialized", false));
            health.put("status", "UP");
            return ResponseEntity.ok(health);
        }

        boolean redisHealthy = checkRedisHealth();
        health.put("redis", Map.of("status", redisHealthy ? "UP" : "DOWN"));

        try {
            Map<String, Map<String, Object>> cbMetrics = getCircuitBreakerMetrics();
            health.put("circuitBreakers", cbMetrics);
        } catch (Exception e) {
            logger.debug("Could not get circuit breaker metrics", e);
        }

        health.put("status", redisHealthy ? "UP" : "DEGRADED");

        HttpStatus statusCode = redisHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
        return ResponseEntity.status(statusCode).body(health);
    }

    private boolean checkRedisHealth() {
        try {
            redissonClient.getBucket("health-check-ping").isExists();
            return true;
        } catch (Exception e) {
            logger.debug("Redis health check failed", e);
            return false;
        }
    }

    private Map<String, Map<String, Object>> getCircuitBreakerMetrics() {
        Map<String, Map<String, Object>> metrics = new LinkedHashMap<>();

        circuitBreakerRegistry.getAllCircuitBreakers().forEach(cb -> {
            var cbMetrics = cb.getMetrics();
            metrics.put(cb.getName(), Map.of(
                    "state", cb.getState().toString(),
                    "failureRate", cbMetrics.getFailureRate(),
                    "slowCallRate", cbMetrics.getSlowCallRate(),
                    "numberOfSuccessfulCalls", cbMetrics.getNumberOfSuccessfulCalls(),
                    "numberOfFailedCalls", cbMetrics.getNumberOfFailedCalls(),
                    "numberOfSlowCalls", cbMetrics.getNumberOfSlowCalls()));
        });

        return metrics;
    }
}
