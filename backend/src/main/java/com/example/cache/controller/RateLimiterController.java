package com.example.cache.controller;

import com.example.cache.service.RateLimiterDemoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Tag(name = "RateLimiter", description = "Resilience4j レートリミッター状態確認・フラッドデモ")
@RestController
@RequestMapping("/api/rate-limiter")
public class RateLimiterController {

    private static final Logger logger = LoggerFactory.getLogger(RateLimiterController.class);

    private final RateLimiterDemoService rateLimiterDemoService;

    public RateLimiterController(RateLimiterDemoService rateLimiterDemoService) {
        this.rateLimiterDemoService = rateLimiterDemoService;
    }

    @Operation(summary = "レートリミッター状態取得", description = "現在の利用可能パーミット数・待機スレッド数・設定値を返す")
    @ApiResponse(responseCode = "200", description = "状態取得成功")
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        var status = rateLimiterDemoService.getRateLimiterStatus();
        return ResponseEntity.ok(Map.of(
                "availablePermissions",  status.availablePermissions(),
                "numberOfWaitingThreads", status.numberOfWaitingThreads(),
                "cyclePeriodMs",         status.cyclePeriodMs(),
                "limitForPeriod",        status.limitForPeriod(),
                "timestamp",             System.currentTimeMillis()));
    }

    @Operation(summary = "[デモ] フラッドリクエスト", description = "複数スレッドで同時リクエストを発生させ、レートリミッターの許可/拒否を可視化する。workers・burstCount は 1〜20")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "デモ実行成功（rejected=拒否件数を含む）"),
        @ApiResponse(responseCode = "400", description = "パラメータが範囲外")
    })
    @PostMapping("/flood")
    public ResponseEntity<Map<String, Object>> flood(
            @RequestBody Map<String, Object> body) {

        int workers    = body.containsKey("workers")    ? ((Number) body.get("workers")).intValue()    : 5;
        int burstCount = body.containsKey("burstCount") ? ((Number) body.get("burstCount")).intValue() : 3;

        if (workers < 1 || workers > 20 || burstCount < 1 || burstCount > 20) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "workers と burstCount は 1〜20 の範囲で指定してください",
                    "timestamp", System.currentTimeMillis()));
        }

        logger.info("Flood リクエスト: workers={}, burstCount={}", workers, burstCount);
        var result = rateLimiterDemoService.executeFlood(workers, burstCount);

        return ResponseEntity.ok(Map.of(
                "requested",  result.requested(),
                "permitted",  result.permitted(),
                "rejected",   result.rejected(),
                "events",     result.events(),
                "timestamp",  System.currentTimeMillis()));
    }
}
