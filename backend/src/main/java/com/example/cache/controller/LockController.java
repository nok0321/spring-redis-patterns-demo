package com.example.cache.controller;

import com.example.cache.service.DistributedLockService;
import com.example.cache.service.LockDemoOrchestrator;
import com.example.cache.service.LockDemoService;
import com.example.cache.service.TransactionalLockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.redisson.client.RedisConnectionException;
import org.redisson.client.RedisTimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@Tag(name = "Lock", description = "Redis 分散ロック・フェンスドロック・トランザクション・転送・デモ操作")
@RestController
@RequestMapping("/api/lock")
public class LockController {

    private static final Logger logger = LoggerFactory.getLogger(LockController.class);

    private final DistributedLockService lockService;
    private final TransactionalLockService transactionalLockService;
    private final LockDemoService lockDemoService;
    private final LockDemoOrchestrator lockDemoOrchestrator;

    /** デモ用危険操作（forceUnlock）の有効フラグ。本番環境では false にすること */
    @Value("${demo.features.enabled:false}")
    private boolean demoFeaturesEnabled;

    public LockController(DistributedLockService lockService,
                          TransactionalLockService transactionalLockService,
                          LockDemoService lockDemoService,
                          LockDemoOrchestrator lockDemoOrchestrator) {
        this.lockService = lockService;
        this.transactionalLockService = transactionalLockService;
        this.lockDemoService = lockDemoService;
        this.lockDemoOrchestrator = lockDemoOrchestrator;
    }

    @Operation(summary = "ロック状態確認", description = "指定したロックキーが現在ロック中か確認する")
    @ApiResponse(responseCode = "200", description = "状態取得成功")
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getLockStatus(
            @RequestParam String lockKey) {

        if (lockKey == null || lockKey.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "lockKey parameter is required",
                    "timestamp", System.currentTimeMillis()));
        }

        boolean locked = lockService.isLocked(lockKey);

        return ResponseEntity.ok(Map.of(
                "lockKey", lockKey,
                "locked", locked,
                "timestamp", System.currentTimeMillis()));
    }

    @Operation(summary = "ロックメトリクス取得", description = "全ロックキーの取得成功数・失敗数・待機時間等の統計を返す")
    @ApiResponse(responseCode = "200", description = "メトリクス取得成功")
    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> getMetrics() {
        var metrics = lockService.getMetrics().getAllStats();

        return ResponseEntity.ok(Map.of(
                "locks", metrics,
                "timestamp", System.currentTimeMillis()));
    }

    @Operation(summary = "ロック状態確認", description = "指定キーのロック状態を確認する（ロックの取得は行わない）。lockType: standard/read/write")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "確認成功"),
        @ApiResponse(responseCode = "400", description = "lockKey が未指定")
    })
    @PostMapping("/check-status")
    public ResponseEntity<Map<String, Object>> checkLockStatus(
            @RequestBody Map<String, Object> body) {

        String lockKey = (String) body.get("lockKey");
        if (lockKey == null || lockKey.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "lockKey is required",
                    "timestamp", System.currentTimeMillis()));
        }

        String lockType = (String) body.getOrDefault("lockType", "standard");

        boolean isCurrentlyLocked = lockService.isLocked(lockKey);

        Map<String, Object> result = new HashMap<>();
        result.put("lockKey", lockKey);
        result.put("canAcquire", !isCurrentlyLocked);
        result.put("currentlyLocked", isCurrentlyLocked);
        result.put("lockType", lockType);
        result.put("timestamp", System.currentTimeMillis());

        return ResponseEntity.ok(result);
    }

    @Operation(summary = "フェンスドロック取得・実行", description = "フェンシングトークン付きロックを取得し、操作を実行する。operation: fenced_cache_read/fenced_cache_update/fenced_critical_section/fenced_atomic_increment/fenced_conditional_update")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "実行成功"),
        @ApiResponse(responseCode = "400", description = "lockKey 未指定または不明な operation")
    })
    @SuppressWarnings("unchecked") // JSON body value cast to Map<String,Object> — safe for well-formed request body
    @PostMapping("/acquire-fenced")
    public ResponseEntity<Map<String, Object>> acquireFencedLock(
            @RequestBody Map<String, Object> body) {

        String lockKey = (String) body.get("lockKey");
        if (lockKey == null || lockKey.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "lockKey is required",
                    "timestamp", System.currentTimeMillis()));
        }

        String operation = (String) body.get("operation");
        Map<String, Object> data = (Map<String, Object>) body.get("data");

        // No operation specified: simple fenced lock acquisition
        if (operation == null || operation.isEmpty()) {
            Optional<Long> token = lockService.executeWithFencedLock(lockKey, (Long fencingToken) -> {
                logger.info("Fenced lock acquired with token: {}", fencingToken);
                return fencingToken;
            });

            Map<String, Object> result = new HashMap<>();
            result.put("lockKey", lockKey);
            result.put("acquired", token.isPresent());
            result.put("fencingToken", token.orElse(null));
            result.put("timestamp", System.currentTimeMillis());

            return ResponseEntity.ok(result);
        }

        // Operation-based fenced lock execution
        Set<String> DATA_REQUIRED_OPS = Set.of(
                "fenced_cache_read", "fenced_cache_update", "fenced_critical_section",
                "fenced_atomic_increment", "fenced_conditional_update");
        if (DATA_REQUIRED_OPS.contains(operation) && data == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "'data' field is required for operation: " + operation,
                    "timestamp", System.currentTimeMillis()));
        }

        Optional<Map<String, Object>> result = lockDemoOrchestrator.executeFencedOperation(lockKey, operation, data);

        if (result.isPresent()) {
            Map<String, Object> responseData = new HashMap<>(result.get());
            responseData.put("lockKey", lockKey);
            responseData.put("timestamp", System.currentTimeMillis());
            return ResponseEntity.ok(responseData);
        } else {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Unknown fenced operation or lock acquisition failed",
                    "timestamp", System.currentTimeMillis()));
        }
    }

    @Operation(summary = "ロック解放", description = "ロックを解放する。force=true は demo.features.enabled=true 時のみ有効（強制解放）")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "解放成功"),
        @ApiResponse(responseCode = "403", description = "強制解放がデモ環境以外で拒否")
    })
    @PostMapping("/release")
    public ResponseEntity<Map<String, Object>> releaseLock(
            @RequestBody Map<String, Object> body) {

        String lockKey = (String) body.get("lockKey");
        if (lockKey == null || lockKey.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "lockKey is required",
                    "timestamp", System.currentTimeMillis()));
        }

        boolean force = Boolean.parseBoolean(String.valueOf(body.getOrDefault("force", false)));

        if (force && !demoFeaturesEnabled) {
            logger.warn("forceUnlock が非デモ環境で拒否されました: key={}", lockKey);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error", "Force unlock is disabled in this environment",
                    "timestamp", System.currentTimeMillis()));
        }

        boolean released = false;
        if (force) {
            released = lockService.forceUnlock(lockKey);
        }

        return ResponseEntity.ok(Map.of(
                "lockKey", lockKey,
                "released", released,
                "forced", force,
                "timestamp", System.currentTimeMillis()));
    }

    @Operation(summary = "ロック付き操作実行", description = "ロックを取得してから操作を実行する。operation: cache_update/cache_read/batch_read/atomic_increment")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "実行成功"),
        @ApiResponse(responseCode = "400", description = "必須パラメータ欠如または不明な operation")
    })
    @SuppressWarnings("unchecked") // JSON body values cast to Map/List — safe for well-formed request body
    @PostMapping("/execute")
    public ResponseEntity<Map<String, Object>> executeWithLock(
            @RequestBody Map<String, Object> body) {

        String lockKey = (String) body.get("lockKey");
        String operation = (String) body.get("operation");
        Map<String, Object> data = (Map<String, Object>) body.get("data");

        if (lockKey == null || operation == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "lockKey and operation are required",
                    "timestamp", System.currentTimeMillis()));
        }

        Set<String> DATA_REQUIRED_OPS = Set.of("cache_update", "cache_read", "batch_read", "atomic_increment");
        if (DATA_REQUIRED_OPS.contains(operation) && data == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "'data' field is required for operation: " + operation,
                    "timestamp", System.currentTimeMillis()));
        }

        Optional<Map<String, Object>> result = lockDemoOrchestrator.executeLockOperation(lockKey, operation, data);

        if (result.isPresent()) {
            return ResponseEntity.ok(result.get());
        } else {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Unknown operation or lock acquisition failed",
                    "timestamp", System.currentTimeMillis()));
        }
    }

    @Operation(summary = "トランザクション実行", description = "Redisson トランザクション内で複数キーを一括更新する。lockKey 指定時はロック付きトランザクション")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "実行成功"),
        @ApiResponse(responseCode = "400", description = "updates が未指定")
    })
    @SuppressWarnings("unchecked") // JSON body "updates" cast to Map<String,Object> — safe for well-formed request body
    @PostMapping("/execute-transaction")
    public ResponseEntity<Map<String, Object>> executeTransaction(
            @RequestBody Map<String, Object> body) {

        String lockKey = (String) body.get("lockKey");
        Map<String, Object> updates = (Map<String, Object>) body.get("updates");

        if (updates == null || updates.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "updates are required",
                    "timestamp", System.currentTimeMillis()));
        }

        boolean success;
        if (lockKey != null) {
            success = transactionalLockService.executeWithTransactionalLock(lockKey, transaction -> {
                updates.forEach((key, value) -> {
                    transaction.getBucket(key).set(value);
                });
                return true;
            }).orElse(false);
        } else {
            success = transactionalLockService.executeBatchWithTransaction(updates);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("success", success);
        result.put("updates", updates.size());
        result.put("lockKey", lockKey != null ? lockKey : "none");
        result.put("timestamp", System.currentTimeMillis());

        return ResponseEntity.ok(result);
    }

    @Operation(summary = "残高転送", description = "fromKey → toKey へ amount を転送する。Saga パターンで補償トランザクション付き")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "転送成功"),
        @ApiResponse(responseCode = "400", description = "パラメータ不正")
    })
    @PostMapping("/transfer")
    public ResponseEntity<Map<String, Object>> transfer(
            @RequestBody Map<String, Object> body) {

        String fromKey = (String) body.get("fromKey");
        String toKey = (String) body.get("toKey");
        Object amountObj = body.get("amount");

        if (fromKey == null || toKey == null || !(amountObj instanceof Number amountNum)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "fromKey, toKey, and positive amount are required",
                    "timestamp", System.currentTimeMillis()));
        }

        double amount = amountNum.doubleValue();
        if (amount <= 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "fromKey, toKey, and positive amount are required",
                    "timestamp", System.currentTimeMillis()));
        }

        String transferId = "transfer_" + UUID.randomUUID();
        boolean success = transactionalLockService.executeTransfer(fromKey, toKey, amount, transferId);

        return ResponseEntity.ok(Map.of(
                "transferId", transferId,
                "success", success,
                "fromKey", fromKey,
                "toKey", toKey,
                "amount", amount,
                "timestamp", System.currentTimeMillis()));
    }

    @Operation(summary = "[デモ] ロック有無の比較実行", description = "同一カウンタを複数スレッドで同時更新し、ロック有無による lost updates の差を可視化する")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "デモ実行成功"),
        @ApiResponse(responseCode = "500", description = "デモ実行失敗")
    })
    @PostMapping("/demo/run")
    public ResponseEntity<Map<String, Object>> runDemo(
            @RequestBody Map<String, Object> body) {

        int workers      = ((Number) body.getOrDefault("workers", 4)).intValue();
        int initialValue = ((Number) body.getOrDefault("initialValue", 10)).intValue();

        workers      = Math.max(2, Math.min(8, workers));
        initialValue = Math.max(workers, Math.min(50, initialValue));

        try {
            LockDemoService.DemoResult withoutLock = lockDemoService.runWithoutLock(workers, initialValue);
            LockDemoService.DemoResult withLock    = lockDemoService.runWithLock(workers, initialValue);

            return ResponseEntity.ok(Map.of(
                    "withoutLock", toMap(withoutLock),
                    "withLock",    toMap(withLock),
                    "timestamp",   System.currentTimeMillis()));
        } catch (Exception e) {
            logger.error("Demo run failed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "error",     "デモの実行に失敗しました: " + e.getMessage(),
                    "timestamp", System.currentTimeMillis()));
        }
    }

    private Map<String, Object> toMap(LockDemoService.DemoResult r) {
        List<Map<String, Object>> events = r.events().stream()
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("workerId",   e.workerId());
                    m.put("step",       e.step());
                    m.put("value",      e.value());
                    m.put("relativeMs", e.relativeMs());
                    return m;
                })
                .toList();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("initialValue",  r.initialValue());
        m.put("expectedFinal", r.expectedFinal());
        m.put("actualFinal",   r.actualFinal());
        m.put("lostUpdates",   r.lostUpdates());
        m.put("correct",       r.correct());
        m.put("events",        events);
        return m;
    }

    @ExceptionHandler(RedisConnectionException.class)
    public ResponseEntity<Map<String, Object>> handleRedisConnectionException(RedisConnectionException e) {
        logger.error("Redis connection error - retryable", e);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "error", "Service temporarily unavailable",
                "timestamp", System.currentTimeMillis()));
    }

    @ExceptionHandler(RedisTimeoutException.class)
    public ResponseEntity<Map<String, Object>> handleRedisTimeoutException(RedisTimeoutException e) {
        logger.warn("Redis timeout - may be transient", e);
        return ResponseEntity.status(HttpStatus.REQUEST_TIMEOUT).body(Map.of(
                "error", "Request timeout",
                "timestamp", System.currentTimeMillis()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgumentException(IllegalArgumentException e) {
        logger.warn("Invalid request parameters", e);
        return ResponseEntity.badRequest().body(Map.of(
                "error", "Invalid parameters: " + e.getMessage(),
                "timestamp", System.currentTimeMillis()));
    }
}
