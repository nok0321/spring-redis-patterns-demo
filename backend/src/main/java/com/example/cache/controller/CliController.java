package com.example.cache.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;

/**
 * Redis CLI コントローラー
 * ホワイトリストで許可されたコマンドのみ実行を許可する
 */
@Tag(name = "CLI", description = "ホワイトリスト制限付き Redis コマンド実行インターフェース")
@RestController
@RequestMapping("/api/cli")
public class CliController {

    private static final Logger logger = LoggerFactory.getLogger(CliController.class);

    /** 読み取り専用コマンド（常に許可） */
    private static final Set<String> ALLOWED_COMMANDS = Set.of(
            "GET", "SET", "KEYS", "SCAN", "TTL", "PTTL", "TYPE",
            "INFO", "LLEN", "HGETALL", "SMEMBERS", "ZRANGE", "ZCARD",
            "STRLEN", "MEMORY", "SLOWLOG"
    );

    /** 書き込み系コマンド: demoFeaturesEnabled=true のときのみ許可 */
    private static final Set<String> WRITE_COMMANDS = Set.of("SET");

    /** デモ用書き込みコマンドの有効フラグ。本番環境では false にすること */
    @Value("${demo.features.enabled:false}")
    private boolean demoFeaturesEnabled;

    private final RedissonClient redissonClient;

    public CliController(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    @Operation(summary = "Redis コマンド実行",
        description = """
            ホワイトリストに含まれるコマンドのみ実行可能。
            読み取り専用: GET / KEYS / SCAN / TTL / PTTL / TYPE / INFO / LLEN / HGETALL / SMEMBERS / ZRANGE / ZCARD / STRLEN / MEMORY / SLOWLOG
            書き込み（demo.features.enabled=true 時のみ）: SET
            """)
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "コマンド実行成功"),
        @ApiResponse(responseCode = "400", description = "コマンド未指定またはホワイトリスト外"),
        @ApiResponse(responseCode = "403", description = "書き込みコマンドがデモ環境以外で拒否"),
        @ApiResponse(responseCode = "500", description = "コマンド実行エラー")
    })
    @PostMapping("/execute")
    public ResponseEntity<Map<String, Object>> execute(
            @RequestBody Map<String, Object> body) {

        String rawCommand = (String) body.getOrDefault("command", "");
        if (rawCommand == null || rawCommand.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "コマンドを入力してください",
                    "timestamp", System.currentTimeMillis()));
        }

        String[] parts = rawCommand.trim().split("\\s+");
        String cmd = parts[0].toUpperCase();

        if (!ALLOWED_COMMANDS.contains(cmd)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "command", rawCommand,
                    "error", "Command not allowed: " + cmd,
                    "timestamp", System.currentTimeMillis()));
        }

        if (WRITE_COMMANDS.contains(cmd) && !demoFeaturesEnabled) {
            logger.warn("書き込みコマンドが非デモ環境で拒否されました: {}", cmd);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "command", rawCommand,
                    "error", "Write commands are disabled in this environment",
                    "timestamp", System.currentTimeMillis()));
        }

        long t0 = System.currentTimeMillis();
        try {
            Object result = dispatch(cmd, parts);
            return ResponseEntity.ok(Map.of(
                    "command", rawCommand,
                    "result", result != null ? result.toString() : "(nil)",
                    "executionMs", System.currentTimeMillis() - t0,
                    "timestamp", System.currentTimeMillis()));
        } catch (Exception e) {
            logger.warn("CLI コマンド実行エラー: {}", rawCommand, e);
            return ResponseEntity.internalServerError().body(Map.of(
                    "command", rawCommand,
                    "error", "Command execution failed",
                    "executionMs", System.currentTimeMillis() - t0,
                    "timestamp", System.currentTimeMillis()));
        }
    }

    private Object dispatch(String cmd, String[] parts) {
        return switch (cmd) {
            case "GET" -> {
                if (parts.length < 2) yield "ERR: GET requires a key";
                yield redissonClient.getBucket(parts[1]).get();
            }
            case "SET" -> {
                if (parts.length < 3) yield "ERR: SET requires key and value";
                // parts[2..] を結合してスペースを含む値に対応
                String setValue = String.join(" ", java.util.Arrays.copyOfRange(parts, 2, parts.length));
                redissonClient.<String>getBucket(parts[1]).set(setValue);
                yield "OK";
            }
            case "KEYS" -> {
                String pattern = parts.length > 1 ? parts[1] : "*";
                var keys = new java.util.ArrayList<String>();
                redissonClient.getKeys().getKeysStream(
                    new org.redisson.api.options.KeysScanParams().pattern(pattern).limit(100)
                ).forEach(keys::add);
                yield keys;
            }
            case "TTL" -> {
                if (parts.length < 2) yield "ERR: TTL requires a key";
                long ttl = redissonClient.getBucket(parts[1]).remainTimeToLive();
                yield ttl >= 0 ? ttl / 1000 : ttl; // ms → s
            }
            case "PTTL" -> {
                if (parts.length < 2) yield "ERR: PTTL requires a key";
                yield redissonClient.getBucket(parts[1]).remainTimeToLive();
            }
            case "TYPE" -> {
                if (parts.length < 2) yield "ERR: TYPE requires a key";
                var t = redissonClient.getKeys().getType(parts[1]);
                yield t != null ? t.name().toLowerCase() : "none";
            }
            case "STRLEN" -> {
                if (parts.length < 2) yield "ERR: STRLEN requires a key";
                Object v = redissonClient.getBucket(parts[1]).get();
                yield v != null ? v.toString().length() : 0;
            }
            case "LLEN" -> {
                if (parts.length < 2) yield "ERR: LLEN requires a key";
                yield redissonClient.getList(parts[1]).size();
            }
            case "HGETALL" -> {
                if (parts.length < 2) yield "ERR: HGETALL requires a key";
                yield redissonClient.getMap(parts[1]).readAllMap();
            }
            case "SMEMBERS" -> {
                if (parts.length < 2) yield "ERR: SMEMBERS requires a key";
                yield redissonClient.getSet(parts[1]).readAll();
            }
            case "ZRANGE" -> {
                if (parts.length < 4) yield "ERR: ZRANGE requires key start stop";
                try {
                    int start = Integer.parseInt(parts[2]);
                    int stop  = Integer.parseInt(parts[3]);
                    var sset = redissonClient.<Object>getScoredSortedSet(parts[1]);
                    int size = sset.size();
                    if (size == 0) yield java.util.List.of();
                    int from = start < 0 ? Math.max(0, size + start) : start;
                    int to   = stop  < 0 ? size + stop + 1 : Math.min(stop + 1, size);
                    yield sset.valueRange(from, to - 1);
                } catch (NumberFormatException e) {
                    yield "ERR: start and stop must be integers";
                }
            }
            case "ZCARD" -> {
                if (parts.length < 2) yield "ERR: ZCARD requires a key";
                yield redissonClient.getScoredSortedSet(parts[1]).size();
            }
            case "INFO" -> "Redis info: see /health endpoint for details";
            case "MEMORY" -> "memory usage: see Actuator metrics";
            case "SLOWLOG" -> "slowlog: not available via this interface";
            case "SCAN" -> {
                // NOTE: このSCAN実装はカーソルベースの反復をサポートしない。
                // 常に先頭から最大100件を返す。CURSOR引数 (SCAN 0 COUNT n) は無視される。
                // 全キーを反復するには /api/cache/search エンドポイントを使用すること。
                var keys = new java.util.ArrayList<String>();
                redissonClient.getKeys().getKeysStream(
                    new org.redisson.api.options.KeysScanParams().limit(100)
                ).forEach(keys::add);
                yield keys;
            }
            default -> "ERR: unknown command";
        };
    }
}
