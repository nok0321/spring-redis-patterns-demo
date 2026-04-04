package com.example.cache.controller;

import com.example.cache.service.CacheMetadataService;
import com.example.cache.service.ResilientCacheService;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Tag(name = "Cache", description = "Redis キャッシュの CRUD・バッチ・TTL・型情報・サーキットブレーカー操作")
@RestController
@RequestMapping("/api/cache")
public class CacheController {

    private static final Logger logger = LoggerFactory.getLogger(CacheController.class);

    private final ResilientCacheService cacheService;
    private final CircuitBreakerRegistry circuitBreakerRegistry;
    private final CacheMetadataService cacheMetadataService;

    /** デモ用危険エンドポイントの有効フラグ。本番環境では false にすること */
    @Value("${demo.features.enabled:false}")
    private boolean demoFeaturesEnabled;

    public CacheController(ResilientCacheService cacheService,
                           CircuitBreakerRegistry circuitBreakerRegistry,
                           CacheMetadataService cacheMetadataService) {
        this.cacheService = cacheService;
        this.circuitBreakerRegistry = circuitBreakerRegistry;
        this.cacheMetadataService = cacheMetadataService;
    }

    @Operation(summary = "キャッシュ取得", description = "指定したキーの値を取得する。type パラメータで型を指定可能（String/Integer/Map 等）")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "取得成功（found=false の場合はキャッシュミス）"),
        @ApiResponse(responseCode = "400", description = "キーが空または長すぎる")
    })
    @GetMapping("/get/{key}")
    public ResponseEntity<Map<String, Object>> getCache(
            @Parameter(description = "Redis キー") @PathVariable String key) {

        Optional<ResponseEntity<Map<String, Object>>> keyError = validateKey(key);
        if (keyError.isPresent()) return keyError.get();

        Optional<?> value = cacheService.get(key, null);

        Map<String, Object> result = new HashMap<>();
        result.put("key", key);
        result.put("found", value.isPresent());
        result.put("value", value.orElse(null));

        return ResponseEntity.ok(result);
    }

    @Operation(summary = "バッチ取得", description = "カンマ区切りのキー一覧を一括取得する（最大500キー）")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "取得成功"),
        @ApiResponse(responseCode = "400", description = "キーが未指定または上限超過")
    })
    @GetMapping("/batch")
    public ResponseEntity<Map<String, Object>> getBatch(
            @RequestParam String keys) {

        if (keys == null || keys.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Keys parameter is required",
                    "timestamp", System.currentTimeMillis()));
        }

        Set<String> keySet = new HashSet<>(Arrays.asList(keys.split(",")));
        if (keySet.size() > batchKeysMax) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Too many keys: max " + batchKeysMax + " allowed",
                    "timestamp", System.currentTimeMillis()));
        }
        Map<String, Object> results = cacheService.getBatch(keySet);

        return ResponseEntity.ok(Map.of(
                "requested", keySet.size(),
                "found", results.size(),
                "results", results));
    }

    @Value("${cache.search-limit-max:1000}")
    private int searchLimitMax;

    @Value("${cache.batch-keys-max:500}")
    private int batchKeysMax;
    /** Redis キーの最大バイト長 (UTF-8)。Redis の実装上限は 512MB だが API 上は 512 バイトを上限とする。 */
    private static final int KEY_MAX_BYTES = 512;

    /**
     * キーの基本検証。null/空チェックと最大長チェックを行う。
     * 問題があれば 400 Bad Request を含む Optional、問題なければ空の Optional を返す。
     */
    private Optional<ResponseEntity<Map<String, Object>>> validateKey(String key) {
        if (key == null || key.isEmpty()) {
            return Optional.of(ResponseEntity.badRequest().body(Map.of(
                    "error", "Key is required",
                    "timestamp", System.currentTimeMillis())));
        }
        if (key.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > KEY_MAX_BYTES) {
            return Optional.of(ResponseEntity.badRequest().body(Map.of(
                    "error", "Key exceeds maximum length of " + KEY_MAX_BYTES + " bytes",
                    "timestamp", System.currentTimeMillis())));
        }
        return Optional.empty();
    }

    @Operation(summary = "キー検索", description = "glob パターンでキーを検索する（例: user:*）。最大1000件")
    @ApiResponse(responseCode = "200", description = "検索成功")
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchKeys(
            @RequestParam(defaultValue = "*") String pattern,
            @RequestParam(defaultValue = "100") int limit) {

        int safeLimit = Math.min(Math.max(limit, 1), searchLimitMax);
        Set<String> keys = cacheService.searchKeys(pattern, safeLimit);

        return ResponseEntity.ok(Map.of(
                "pattern", pattern,
                "limit", safeLimit,
                "count", keys.size(),
                "keys", keys));
    }

    @Operation(summary = "キャッシュメトリクス取得", description = "ヒット数・ミス数・エラー数等の統計を返す")
    @ApiResponse(responseCode = "200", description = "メトリクス取得成功")
    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Long>> getMetrics() {
        var metrics = cacheService.getMetrics().toMap();
        return ResponseEntity.ok(metrics);
    }

    @Operation(summary = "キャッシュサービスヘルスチェック", description = "サーキットブレーカー状態を含むキャッシュサービスの死活確認")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "正常"),
        @ApiResponse(responseCode = "503", description = "Redis 接続異常")
    })
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> getHealth() {
        boolean healthy = cacheService.isHealthy();
        HttpStatus status = healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

        return ResponseEntity.status(status).body(Map.of(
                "status", healthy ? "UP" : "DOWN",
                "cache", healthy));
    }

    @Operation(summary = "キャッシュ保存", description = "キーと値を保存する。TTL は秒数（数値）または ISO-8601 形式（PT1H 等）で指定。省略時は 1 時間")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "保存成功"),
        @ApiResponse(responseCode = "400", description = "リクエスト不正"),
        @ApiResponse(responseCode = "500", description = "保存失敗")
    })
    @PostMapping("/set/{key}")
    public ResponseEntity<Map<String, Object>> setCache(
            @Parameter(description = "Redis キー") @PathVariable String key,
            @RequestBody Map<String, Object> body) {

        Optional<ResponseEntity<Map<String, Object>>> keyError = validateKey(key);
        if (keyError.isPresent()) return keyError.get();

        Object value = body.get("value");
        if (value == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Value is required",
                    "timestamp", System.currentTimeMillis()));
        }

        Duration ttl = Duration.ofHours(1);
        if (body.containsKey("ttl")) {
            Object ttlValue = body.get("ttl");
            if (ttlValue instanceof Number n) {
                ttl = Duration.ofSeconds(n.longValue());
            } else if (ttlValue instanceof String s) {
                try {
                    ttl = Duration.parse(s);
                } catch (DateTimeParseException e) {
                    return ResponseEntity.badRequest().body(Map.of(
                            "error", "Invalid ttl format. Use ISO-8601 duration (e.g. PT1H) or omit for default",
                            "timestamp", System.currentTimeMillis()));
                }
            }
        }

        CompletableFuture<Boolean> future = cacheService.setAsync(key, value, ttl);

        try {
            boolean success = future.get(5, TimeUnit.SECONDS);
            return ResponseEntity.ok(Map.of(
                    "key", key,
                    "success", success,
                    "ttl", ttl.toString()));
        } catch (Exception e) {
            logger.error("Failed to set key: {}", key, e);
            return ResponseEntity.internalServerError().body(Map.of(
                    "error", "Failed to set value",
                    "timestamp", System.currentTimeMillis()));
        }
    }

    @Operation(summary = "バッチ保存", description = "複数のキーと値をまとめて保存する。各エントリに key/value/ttl（秒）を指定")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "保存成功（partial failure も 200 で返却し failed 件数を含む）"),
        @ApiResponse(responseCode = "400", description = "エントリ未指定または key/value 欠如"),
        @ApiResponse(responseCode = "500", description = "バッチ操作失敗")
    })
    @SuppressWarnings("unchecked") // CompletableFuture[] raw array creation required by CompletableFuture.allOf() vararg
    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> setBatch(
            @RequestBody List<Map<String, Object>> entries) {

        if (entries == null || entries.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Entries are required",
                    "timestamp", System.currentTimeMillis()));
        }

        List<CompletableFuture<Boolean>> futures = new ArrayList<>();
        for (int i = 0; i < entries.size(); i++) {
            Map<String, Object> entry = entries.get(i);
            String key = (String) entry.get("key");
            Object value = entry.get("value");

            if (key == null || key.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "Entry at index " + i + " is missing 'key'",
                        "timestamp", System.currentTimeMillis()));
            }
            if (value == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "Entry at index " + i + " is missing 'value'",
                        "timestamp", System.currentTimeMillis()));
            }

            Duration ttl = Duration.ofHours(1);
            if (entry.containsKey("ttl")) {
                Object ttlValue = entry.get("ttl");
                if (!(ttlValue instanceof Number n)) {
                    return ResponseEntity.badRequest().body(Map.of(
                            "error", "Entry at index " + i + ": 'ttl' must be a number (seconds)",
                            "timestamp", System.currentTimeMillis()));
                }
                ttl = Duration.ofSeconds(n.longValue());
            }

            futures.add(cacheService.setAsync(key, value, ttl));
        }

        CompletableFuture<Void> allOf = CompletableFuture.allOf(
                futures.toArray(new CompletableFuture[0]));

        try {
            allOf.get(10, TimeUnit.SECONDS);
            long successful = futures.stream()
                    .filter(f -> {
                        try {
                            return Boolean.TRUE.equals(f.get());
                        } catch (Exception e) {
                            logger.debug("Batch set result retrieval error", e);
                            return false;
                        }
                    }).count();

            return ResponseEntity.ok(Map.of(
                    "total", entries.size(),
                    "successful", successful,
                    "failed", entries.size() - successful));
        } catch (Exception e) {
            logger.error("Batch set operation failed", e);
            return ResponseEntity.internalServerError().body(Map.of(
                    "error", "Batch operation failed",
                    "timestamp", System.currentTimeMillis()));
        }
    }

    @Operation(summary = "ウォームアップ", description = "指定したキー群のキャッシュを非同期でウォームアップ（バックグラウンド実行）")
    @ApiResponse(responseCode = "202", description = "ウォームアップ開始")
    @PostMapping("/warmup")
    public ResponseEntity<Map<String, Object>> warmup(
            @RequestBody Set<String> keys) {

        if (keys == null || keys.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Keys are required",
                    "timestamp", System.currentTimeMillis()));
        }

        cacheService.warmUp(keys);

        return ResponseEntity.accepted().body(Map.of(
                "status", "Warmup initiated",
                "keys", keys.size()));
    }

    @Operation(summary = "キャッシュ削除", description = "指定したキーを削除する")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "削除成功（deleted=false はキーが存在しなかった場合）"),
        @ApiResponse(responseCode = "400", description = "キーが空または長すぎる")
    })
    @DeleteMapping("/delete/{key}")
    public ResponseEntity<Map<String, Object>> deleteCache(
            @PathVariable String key) {

        Optional<ResponseEntity<Map<String, Object>>> keyError = validateKey(key);
        if (keyError.isPresent()) return keyError.get();

        boolean success = cacheService.delete(key);

        return ResponseEntity.ok(Map.of(
                "key", key,
                "deleted", success));
    }

    // ----------------------------------------------------------------
    // Feature 2: Circuit Breaker デモ用エンドポイント
    // ----------------------------------------------------------------

    @Operation(summary = "[デモ] エラーシミュレーション", description = "サーキットブレーカーのデモ用。demo.features.enabled=true 時のみ有効")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "設定変更成功"),
        @ApiResponse(responseCode = "403", description = "デモ機能が無効")
    })
    @PostMapping("/simulate-error")
    public ResponseEntity<Map<String, Object>> simulateError(
            @RequestBody Map<String, Object> body) {
        if (!demoFeaturesEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error", "Demo features are disabled in this environment",
                    "timestamp", System.currentTimeMillis()));
        }
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        cacheService.setSimulateError(enabled);
        return ResponseEntity.ok(Map.of(
                "simulationEnabled", enabled,
                "timestamp", System.currentTimeMillis()));
    }

    @Operation(summary = "[デモ] サーキットブレーカーリセット", description = "サーキットブレーカーを CLOSED 状態にリセットする。demo.features.enabled=true 時のみ有効")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "リセット成功"),
        @ApiResponse(responseCode = "403", description = "デモ機能が無効")
    })
    @PostMapping("/reset-circuit-breaker")
    public ResponseEntity<Map<String, Object>> resetCircuitBreaker() {
        if (!demoFeaturesEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error", "Demo features are disabled in this environment",
                    "timestamp", System.currentTimeMillis()));
        }
        circuitBreakerRegistry.circuitBreaker("cache-operations").reset();
        cacheService.setSimulateError(false);
        return ResponseEntity.ok(Map.of(
                "reset", true,
                "state", "CLOSED",
                "timestamp", System.currentTimeMillis()));
    }

    // ----------------------------------------------------------------
    // Feature 4: TTL エンドポイント
    // NOTE: TTL / 型情報の取得は CacheMetadataService に委譲する。
    // これらのメタデータ操作は Resilience4j デコレータを通す必要がないため意図的な設計である。
    // ----------------------------------------------------------------

    @Operation(summary = "TTL 取得", description = "キーの残存時間をミリ秒・秒で返す。キーが存在しない場合は 404")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "TTL 取得成功"),
        @ApiResponse(responseCode = "404", description = "キーが存在しない")
    })
    @GetMapping("/ttl/{key}")
    public ResponseEntity<Map<String, Object>> getTtl(@Parameter(description = "Redis キー") @PathVariable String key) {
        Optional<ResponseEntity<Map<String, Object>>> keyError = validateKey(key);
        if (keyError.isPresent()) return keyError.get();

        return cacheMetadataService.getTtl(key)
                .map(info -> {
                    Map<String, Object> result = new HashMap<>();
                    result.put("key", key);
                    result.put("ttlMs", info.ttlMs());
                    result.put("ttlSeconds", info.ttlSeconds());
                    result.put("persistent", info.persistent());
                    return ResponseEntity.ok(result);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Operation(summary = "TTL バッチ取得", description = "カンマ区切りキー一覧の TTL を一括取得する（最大500キー）")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "取得成功"),
        @ApiResponse(responseCode = "400", description = "キー数が上限超過"),
        @ApiResponse(responseCode = "504", description = "タイムアウト")
    })
    @GetMapping("/ttl-batch")
    public ResponseEntity<Map<String, Object>> getTtlBatch(
            @RequestParam String keys) {
        String[] keyArray = keys.split(",");
        if (keyArray.length > batchKeysMax) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Too many keys: max " + batchKeysMax + " allowed",
                    "timestamp", System.currentTimeMillis()));
        }
        try {
            Map<String, Map<String, Object>> results = cacheMetadataService.getTtlBatch(keyArray);
            return ResponseEntity.ok(Map.of("results", results));
        } catch (TimeoutException e) {
            logger.warn("TTL batch request timed out after 5s");
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT).body(Map.of(
                    "error", "TTL batch request timed out",
                    "timestamp", System.currentTimeMillis()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "error", "Request interrupted",
                    "timestamp", System.currentTimeMillis()));
        } catch (Exception e) {
            logger.error("TTL batch fetch failed", e.getCause() != null ? e.getCause() : e);
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "error", "TTL fetch failed: " + cause.getMessage(),
                    "timestamp", System.currentTimeMillis()));
        }
    }

    // ----------------------------------------------------------------
    // Feature 5: Redis データ型エンドポイント
    // ----------------------------------------------------------------

    @Operation(summary = "Redis データ型取得", description = "キーの Redis データ型（STRING/HASH/LIST/SET/ZSET 等）を返す")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "型取得成功"),
        @ApiResponse(responseCode = "404", description = "キーが存在しない")
    })
    @GetMapping("/type/{key}")
    public ResponseEntity<Map<String, Object>> getKeyType(@Parameter(description = "Redis キー") @PathVariable String key) {
        Optional<ResponseEntity<Map<String, Object>>> keyError = validateKey(key);
        if (keyError.isPresent()) return keyError.get();

        return cacheMetadataService.getKeyType(key)
                .map(typeName -> ResponseEntity.ok(Map.<String, Object>of("key", key, "type", typeName)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Operation(summary = "型付きキャッシュ取得", description = "Redis データ型に応じた適切な読み取り方法でキーの値を取得する")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "取得成功"),
        @ApiResponse(responseCode = "404", description = "キーが存在しない"),
        @ApiResponse(responseCode = "500", description = "読み取り失敗")
    })
    @GetMapping("/get-typed/{key}")
    public ResponseEntity<Map<String, Object>> getTyped(@Parameter(description = "Redis キー") @PathVariable String key) {
        Optional<ResponseEntity<Map<String, Object>>> keyError = validateKey(key);
        if (keyError.isPresent()) return keyError.get();

        try {
            return cacheMetadataService.getTypedValue(key)
                    .map(tv -> {
                        Map<String, Object> result = new HashMap<>();
                        result.put("key", tv.key());
                        result.put("type", tv.type());
                        result.put("value", tv.value());
                        return ResponseEntity.ok(result);
                    })
                    .orElseGet(() -> ResponseEntity.notFound().build());
        } catch (Exception e) {
            logger.warn("get-typed failed for key={}", key, e);
            return ResponseEntity.internalServerError().body(Map.of(
                    "error", "Failed to read key",
                    "key", key,
                    "timestamp", System.currentTimeMillis()));
        }
    }
}
