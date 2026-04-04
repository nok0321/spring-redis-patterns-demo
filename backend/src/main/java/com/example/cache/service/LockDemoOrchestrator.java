package com.example.cache.service;

import com.example.cache.util.TypeResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;

/**
 * ロックデモ操作のオーケストレーター
 *
 * LockController の switch ディスパッチロジックを分離し、
 * フェンスドロック操作と通常ロック操作をそれぞれメソッドとして提供する。
 * Java 21 の switch 式を活用し、各ケースをプライベートメソッドに委譲する。
 */
@Service
public class LockDemoOrchestrator {

    private static final Logger logger = LoggerFactory.getLogger(LockDemoOrchestrator.class);

    private final DistributedLockService lockService;
    private final ResilientCacheService cacheService;

    public LockDemoOrchestrator(DistributedLockService lockService,
                                ResilientCacheService cacheService) {
        this.lockService = lockService;
        this.cacheService = cacheService;
    }

    /**
     * フェンスドロック付き操作を実行する。
     *
     * @param lockKey   ロックキー
     * @param operation 操作種別 (fenced_cache_read / fenced_cache_update /
     *                  fenced_critical_section / fenced_atomic_increment / fenced_conditional_update)
     * @param data      操作パラメータ
     * @return 実行結果の Optional。不明な operation の場合は Optional.empty()
     */
    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> executeFencedOperation(
            String lockKey, String operation, Map<String, Object> data) {

        return switch (operation) {
            case "fenced_cache_read"        -> fencedCacheRead(lockKey, data);
            case "fenced_cache_update"      -> fencedCacheUpdate(lockKey, data);
            case "fenced_critical_section"  -> fencedCriticalSection(lockKey, data);
            case "fenced_atomic_increment"  -> fencedAtomicIncrement(lockKey, data);
            case "fenced_conditional_update" -> fencedConditionalUpdate(lockKey, data);
            default                         -> Optional.empty();
        };
    }

    /**
     * 通常ロック付き操作を実行する。
     *
     * @param lockKey   ロックキー
     * @param operation 操作種別 (cache_update / cache_read / batch_read / atomic_increment)
     * @param data      操作パラメータ
     * @return 実行結果の Optional。不明な operation の場合は Optional.empty()
     */
    @SuppressWarnings("unchecked")
    public Optional<Map<String, Object>> executeLockOperation(
            String lockKey, String operation, Map<String, Object> data) {

        return switch (operation) {
            case "cache_update"      -> lockCacheUpdate(lockKey, data);
            case "cache_read"        -> lockCacheRead(lockKey, data);
            case "batch_read"        -> lockBatchRead(lockKey, data);
            case "atomic_increment"  -> lockAtomicIncrement(lockKey, data);
            default                  -> Optional.empty();
        };
    }

    // -------------------------------------------------------------------------
    // フェンスドロック操作プライベートメソッド
    // -------------------------------------------------------------------------

    private Optional<Map<String, Object>> fencedCacheRead(String lockKey, Map<String, Object> data) {
        return lockService.executeWithFencedLock(lockKey, (Long fencingToken) -> {
            String readKey = (String) data.get("key");
            if (readKey == null) throw new IllegalArgumentException("'key' is required for fenced_cache_read");
            String type = (String) data.getOrDefault("type", "Object");
            Class<?> valueClass = TypeResolver.fromString(type);

            Optional<?> value = cacheService.get(readKey, valueClass, null);
            Map<String, Object> r = new HashMap<>();
            r.put("operation", "fenced_cache_read");
            r.put("fencingToken", fencingToken);
            r.put("key", readKey);
            r.put("found", value.isPresent());
            r.put("value", value.orElse(null));
            r.put("type", type);
            return r;
        });
    }

    private Optional<Map<String, Object>> fencedCacheUpdate(String lockKey, Map<String, Object> data) {
        return lockService.executeWithFencedLock(lockKey, (Long fencingToken) -> {
            List<CompletableFuture<Boolean>> setFutures = new ArrayList<>();
            data.forEach((key, value) -> setFutures.add(cacheService.setAsync(key, value, Duration.ofHours(1))));
            CompletableFuture.allOf(setFutures.toArray(new CompletableFuture[0])).join();
            return Map.<String, Object>of(
                    "operation", "fenced_cache_update",
                    "fencingToken", fencingToken,
                    "status", "updated",
                    "keys", data.keySet(),
                    "keyCount", data.size());
        });
    }

    private Optional<Map<String, Object>> fencedCriticalSection(String lockKey, Map<String, Object> data) {
        return lockService.executeWithFencedLock(lockKey, (Long fencingToken) -> {
            String resourceKey = (String) data.get("resourceKey");
            String operationType = (String) data.get("operationType");

            logger.info("Executing critical section with fencing token: {}", fencingToken);

            return Map.<String, Object>of(
                    "operation", "fenced_critical_section",
                    "fencingToken", fencingToken,
                    "resourceKey", resourceKey,
                    "operationType", operationType,
                    "status", "completed",
                    "executedAt", System.currentTimeMillis());
        });
    }

    private Optional<Map<String, Object>> fencedAtomicIncrement(String lockKey, Map<String, Object> data) {
        return lockService.executeWithFencedLock(lockKey, (Long fencingToken) -> {
            String counterKey = (String) data.get("counterKey");
            if (counterKey == null) throw new IllegalArgumentException("'counterKey' is required for fenced_atomic_increment");
            Number incrementNum = (Number) data.get("increment");
            if (incrementNum == null) throw new IllegalArgumentException("'increment' is required for fenced_atomic_increment");
            int increment = incrementNum.intValue();

            Optional<Integer> current = cacheService.get(counterKey, Integer.class, () -> 0);
            int newValue = current.orElse(0) + increment;

            cacheService.setAsync(counterKey, newValue, Duration.ofDays(1)).join();

            return Map.<String, Object>of(
                    "operation", "fenced_atomic_increment",
                    "fencingToken", fencingToken,
                    "key", counterKey,
                    "previousValue", current.orElse(0),
                    "newValue", newValue,
                    "increment", increment);
        });
    }

    private Optional<Map<String, Object>> fencedConditionalUpdate(String lockKey, Map<String, Object> data) {
        return lockService.executeWithFencedLock(lockKey, (Long fencingToken) -> {
            String targetKey = (String) data.get("key");
            if (targetKey == null) throw new IllegalArgumentException("'key' is required for fenced_conditional_update");
            Object expectedValue = data.get("expectedValue");
            Object newValue = data.get("newValue");
            String type = (String) data.getOrDefault("type", "Object");
            Class<?> valueClass = TypeResolver.fromString(type);

            Optional<?> currentValue = cacheService.get(targetKey, valueClass, null);
            boolean updated = false;

            if (currentValue.isPresent() && currentValue.get().equals(expectedValue)) {
                cacheService.setAsync(targetKey, newValue, Duration.ofHours(1)).join();
                updated = true;
            }

            Map<String, Object> r = new HashMap<>();
            r.put("operation", "fenced_conditional_update");
            r.put("fencingToken", fencingToken);
            r.put("key", targetKey);
            r.put("updated", updated);
            r.put("currentValue", currentValue.orElse(null));
            r.put("expectedValue", expectedValue);
            r.put("newValue", updated ? newValue : null);
            return r;
        });
    }

    // -------------------------------------------------------------------------
    // 通常ロック操作プライベートメソッド
    // -------------------------------------------------------------------------

    private Optional<Map<String, Object>> lockCacheUpdate(String lockKey, Map<String, Object> data) {
        return lockService.executeWithLock(lockKey, () -> {
            List<CompletableFuture<Boolean>> setFutures = new ArrayList<>();
            data.forEach((key, value) -> setFutures.add(cacheService.setAsync(key, value, Duration.ofHours(1))));
            CompletableFuture.allOf(setFutures.toArray(new CompletableFuture[0])).join();
            return Map.<String, Object>of("status", "updated", "keys", data.keySet());
        });
    }

    @SuppressWarnings("unchecked")
    private Optional<Map<String, Object>> lockCacheRead(String lockKey, Map<String, Object> data) {
        return lockService.executeWithReadLock(lockKey, () -> {
            String readKey = (String) data.get("key");
            String type = (String) data.getOrDefault("type", "Object");
            Class<?> valueClass = TypeResolver.fromString(type);

            Optional<?> value = cacheService.get(readKey, valueClass, null);
            Map<String, Object> r = new HashMap<>();
            r.put("key", readKey);
            r.put("found", value.isPresent());
            r.put("value", value.orElse(null));
            r.put("type", type);
            return r;
        });
    }

    @SuppressWarnings("unchecked")
    private Optional<Map<String, Object>> lockBatchRead(String lockKey, Map<String, Object> data) {
        return lockService.executeWithReadLock(lockKey, () -> {
            Set<String> keys = new HashSet<>((List<String>) data.get("keys"));
            return cacheService.getBatch(keys);
        });
    }

    private Optional<Map<String, Object>> lockAtomicIncrement(String lockKey, Map<String, Object> data) {
        return lockService.executeWithLock(lockKey, () -> {
            String counterKey = (String) data.get("counterKey");
            int increment = ((Number) data.get("increment")).intValue();

            Optional<Integer> current = cacheService.get(counterKey, Integer.class, () -> 0);
            int newValue = current.orElse(0) + increment;

            cacheService.setAsync(counterKey, newValue, Duration.ofDays(1)).join();
            return Map.<String, Object>of("key", counterKey, "value", newValue);
        });
    }
}
