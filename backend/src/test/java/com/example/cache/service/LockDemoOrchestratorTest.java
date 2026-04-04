package com.example.cache.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LockDemoOrchestratorTest {

    @Mock
    DistributedLockService lockService;

    @Mock
    ResilientCacheService cacheService;

    @InjectMocks
    LockDemoOrchestrator orchestrator;

    // =========================================================================
    // executeFencedOperation — 各操作の基本テスト
    // =========================================================================

    @Test
    void executeFencedOperation_unknownOp_returnsEmpty() {
        Optional<Map<String, Object>> result =
                orchestrator.executeFencedOperation("lock", "unknown_fenced_op", Map.of());
        assertThat(result).isEmpty();
    }

    @Test
    void executeFencedOperation_fencedCacheRead_valueFound() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
                    return Optional.of(op.execute(1L));
                });
        when(cacheService.get(eq("mykey"), eq(Object.class), isNull()))
                .thenReturn(Optional.of("hello"));

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_cache_read",
                Map.of("key", "mykey"));

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("found", true)
                                .containsEntry("value", "hello")
                                .containsEntry("operation", "fenced_cache_read");
    }

    @Test
    void executeFencedOperation_fencedCacheRead_valueAbsent() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
                    return Optional.of(op.execute(2L));
                });
        when(cacheService.get(eq("mykey"), eq(Object.class), isNull()))
                .thenReturn(Optional.empty());

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_cache_read",
                Map.of("key", "mykey"));

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("found", false);
    }

    @Test
    void executeFencedOperation_fencedCacheUpdate_returnsUpdatedStatus() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
                    return Optional.of(op.execute(3L));
                });
        when(cacheService.setAsync(anyString(), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        Map<String, Object> data = new HashMap<>();
        data.put("k1", "v1");
        data.put("k2", "v2");

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_cache_update", data);

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("status", "updated")
                                .containsEntry("operation", "fenced_cache_update")
                                .containsEntry("keyCount", 2);
        verify(cacheService, times(2)).setAsync(anyString(), any(), any());
    }

    @Test
    void executeFencedOperation_fencedCriticalSection_returnsCompleted() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
                    return Optional.of(op.execute(4L));
                });

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_critical_section",
                Map.of("resourceKey", "res1", "operationType", "write"));

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("status", "completed")
                                .containsEntry("operation", "fenced_critical_section")
                                .containsEntry("resourceKey", "res1");
    }

    @Test
    void executeFencedOperation_fencedAtomicIncrement_returnsNewValue() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
                    return Optional.of(op.execute(5L));
                });
        when(cacheService.get(eq("ctr"), eq(Integer.class), any()))
                .thenReturn(Optional.of(10));
        when(cacheService.setAsync(eq("ctr"), eq(15), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_atomic_increment",
                Map.of("counterKey", "ctr", "increment", 5));

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("newValue", 15)
                                .containsEntry("previousValue", 10)
                                .containsEntry("operation", "fenced_atomic_increment");
    }

    @Test
    void executeFencedOperation_fencedConditionalUpdate_conditionTrue_updatesValue() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
                    return Optional.of(op.execute(6L));
                });
        when(cacheService.get(eq("k1"), eq(Object.class), isNull()))
                .thenReturn(Optional.of("old"));
        when(cacheService.setAsync(eq("k1"), eq("new"), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        Map<String, Object> data = new HashMap<>();
        data.put("key", "k1");
        data.put("expectedValue", "old");
        data.put("newValue", "new");

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_conditional_update", data);

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("updated", true)
                                .containsEntry("newValue", "new");
    }

    @Test
    void executeFencedOperation_fencedConditionalUpdate_conditionFalse_doesNotUpdate() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
                    return Optional.of(op.execute(6L));
                });
        when(cacheService.get(eq("k1"), eq(Object.class), isNull()))
                .thenReturn(Optional.of("different"));

        Map<String, Object> data = new HashMap<>();
        data.put("key", "k1");
        data.put("expectedValue", "old");
        data.put("newValue", "new");

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_conditional_update", data);

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("updated", false);
        verify(cacheService, never()).setAsync(any(), any(), any());
    }

    @Test
    void executeFencedOperation_lockAcquisitionFails_returnsEmpty() {
        when(lockService.executeWithFencedLock(eq("lock"), any()))
                .thenReturn(Optional.empty());

        Optional<Map<String, Object>> result = orchestrator.executeFencedOperation(
                "lock", "fenced_cache_read",
                Map.of("key", "k"));

        assertThat(result).isEmpty();
    }

    // =========================================================================
    // executeLockOperation — 各操作の基本テスト
    // =========================================================================

    @Test
    void executeLockOperation_unknownOp_returnsEmpty() {
        Optional<Map<String, Object>> result =
                orchestrator.executeLockOperation("lock", "unknown_op", Map.of());
        assertThat(result).isEmpty();
    }

    @Test
    void executeLockOperation_cacheUpdate_returnsUpdatedStatus() {
        when(lockService.executeWithLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    Supplier<Object> op = inv.getArgument(1);
                    return Optional.of(op.get());
                });
        when(cacheService.setAsync(anyString(), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        Map<String, Object> data = new HashMap<>();
        data.put("k1", "v1");

        Optional<Map<String, Object>> result = orchestrator.executeLockOperation(
                "lock", "cache_update", data);

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("status", "updated");
        verify(cacheService).setAsync(eq("k1"), eq("v1"), any());
    }

    @Test
    void executeLockOperation_cacheRead_valueFound() {
        when(lockService.executeWithReadLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    Supplier<Object> op = inv.getArgument(1);
                    return Optional.of(op.get());
                });
        when(cacheService.get(eq("rk"), eq(Object.class), isNull()))
                .thenReturn(Optional.of("rval"));

        Optional<Map<String, Object>> result = orchestrator.executeLockOperation(
                "lock", "cache_read",
                Map.of("key", "rk"));

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("found", true)
                                .containsEntry("value", "rval");
    }

    @Test
    void executeLockOperation_cacheRead_valueAbsent() {
        when(lockService.executeWithReadLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    Supplier<Object> op = inv.getArgument(1);
                    return Optional.of(op.get());
                });
        when(cacheService.get(eq("rk"), eq(Object.class), isNull()))
                .thenReturn(Optional.empty());

        Optional<Map<String, Object>> result = orchestrator.executeLockOperation(
                "lock", "cache_read",
                Map.of("key", "rk"));

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("found", false);
    }

    @Test
    void executeLockOperation_batchRead_returnsAllValues() {
        when(lockService.executeWithReadLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    Supplier<Object> op = inv.getArgument(1);
                    return Optional.of(op.get());
                });
        when(cacheService.getBatch(any()))
                .thenReturn(Map.of("k1", "v1", "k2", "v2"));

        Map<String, Object> data = new HashMap<>();
        data.put("keys", List.of("k1", "k2"));

        Optional<Map<String, Object>> result = orchestrator.executeLockOperation(
                "lock", "batch_read", data);

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("k1", "v1")
                                .containsEntry("k2", "v2");
    }

    @Test
    void executeLockOperation_atomicIncrement_returnsNewValue() {
        when(lockService.executeWithLock(eq("lock"), any()))
                .thenAnswer(inv -> {
                    Supplier<Object> op = inv.getArgument(1);
                    return Optional.of(op.get());
                });
        when(cacheService.get(eq("ctr"), eq(Integer.class), any()))
                .thenReturn(Optional.of(7));
        when(cacheService.setAsync(eq("ctr"), eq(10), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        Map<String, Object> data = new HashMap<>();
        data.put("counterKey", "ctr");
        data.put("increment", 3);

        Optional<Map<String, Object>> result = orchestrator.executeLockOperation(
                "lock", "atomic_increment", data);

        assertThat(result).isPresent();
        assertThat(result.get()).containsEntry("value", 10)
                                .containsEntry("key", "ctr");
    }

    @Test
    void executeLockOperation_lockAcquisitionFails_returnsEmpty() {
        when(lockService.executeWithLock(eq("lock"), any()))
                .thenReturn(Optional.empty());

        Optional<Map<String, Object>> result = orchestrator.executeLockOperation(
                "lock", "cache_update",
                Map.of("k1", "v1"));

        assertThat(result).isEmpty();
    }
}
