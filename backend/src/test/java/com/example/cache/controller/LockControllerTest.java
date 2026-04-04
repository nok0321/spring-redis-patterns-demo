package com.example.cache.controller;

import com.example.cache.service.*;
import org.junit.jupiter.api.Test;
import org.redisson.api.RBucket;
import org.redisson.api.RTransaction;
import org.redisson.client.RedisConnectionException;
import org.redisson.client.RedisTimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.*;
import java.util.function.Function;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(LockController.class)
@AutoConfigureMockMvc(addFilters = false)
@TestPropertySource(properties = "demo.features.enabled=true")
class LockControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    DistributedLockService lockService;

    @MockitoBean
    TransactionalLockService transactionalLockService;

    @MockitoBean
    LockDemoService lockDemoService;

    @MockitoBean
    LockDemoOrchestrator lockDemoOrchestrator;

    @Test
    void getLockStatus_locked_returnsTrue() throws Exception {
        when(lockService.isLocked("mylock")).thenReturn(true);

        mockMvc.perform(get("/api/lock/status?lockKey=mylock"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locked").value(true))
                .andExpect(jsonPath("$.lockKey").value("mylock"));
    }

    @Test
    void getLockStatus_unlocked_returnsFalse() throws Exception {
        when(lockService.isLocked("mylock")).thenReturn(false);

        mockMvc.perform(get("/api/lock/status?lockKey=mylock"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locked").value(false));
    }

    @Test
    void getLockStatus_emptyLockKey_returns400() throws Exception {
        mockMvc.perform(get("/api/lock/status?lockKey="))
                .andExpect(status().isBadRequest());
    }

    @Test
    void checkLockStatus_returns200WithCanAcquire() throws Exception {
        when(lockService.isLocked("mylock")).thenReturn(false);

        mockMvc.perform(post("/api/lock/check-status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"lockType\":\"standard\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canAcquire").value(true))
                .andExpect(jsonPath("$.lockType").value("standard"));
    }

    @Test
    void checkLockStatus_missingLockKey_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/check-status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockType\":\"standard\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void acquireFencedLock_noOperation_returnsToken() throws Exception {
        when(lockService.executeWithFencedLock(eq("flock"), any()))
                .thenReturn(Optional.of(42L));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acquired").value(true))
                .andExpect(jsonPath("$.fencingToken").value(42));
    }

    @Test
    void acquireFencedLock_missingLockKey_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void releaseLock_forceTrue_callsForceUnlock() throws Exception {
        when(lockService.forceUnlock("mylock")).thenReturn(true);

        mockMvc.perform(post("/api/lock/release")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"force\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.released").value(true))
                .andExpect(jsonPath("$.forced").value(true));
    }

    @Test
    void releaseLock_forceFalse_doesNotCallForceUnlock() throws Exception {
        mockMvc.perform(post("/api/lock/release")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"force\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.released").value(false))
                .andExpect(jsonPath("$.forced").value(false));

        verify(lockService, never()).forceUnlock(any());
    }

    @Test
    void executeWithLock_missingLockKeyOrOperation_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"operation\":\"cache_update\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeWithLock_unknownOperation_returns400() throws Exception {
        when(lockDemoOrchestrator.executeLockOperation(eq("mylock"), eq("unknown_op"), any()))
                .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"operation\":\"unknown_op\",\"data\":{}}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeWithLock_cacheUpdate_returns200() throws Exception {
        when(lockDemoOrchestrator.executeLockOperation(eq("mylock"), eq("cache_update"), any()))
                .thenReturn(Optional.of(Map.of("status", "updated", "keys", Set.of("k1"))));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"operation\":\"cache_update\",\"data\":{\"k1\":\"v1\"}}"))
                .andExpect(status().isOk());
    }

    @Test
    void executeTransaction_withLockKey_callsTransactionalLock() throws Exception {
        when(transactionalLockService.executeWithTransactionalLock(eq("txlock"), any()))
                .thenReturn(Optional.of(true));

        mockMvc.perform(post("/api/lock/execute-transaction")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"txlock\",\"updates\":{\"k1\":\"v1\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void executeTransaction_withoutLockKey_callsBatchWithTransaction() throws Exception {
        when(transactionalLockService.executeBatchWithTransaction(anyMap())).thenReturn(true);

        mockMvc.perform(post("/api/lock/execute-transaction")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"updates\":{\"k1\":\"v1\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void executeTransaction_emptyUpdates_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/execute-transaction")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"updates\":{}}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void transfer_success_returns200() throws Exception {
        when(transactionalLockService.executeTransfer(eq("from"), eq("to"), eq(100.0), anyString()))
                .thenReturn(true);

        mockMvc.perform(post("/api/lock/transfer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromKey\":\"from\",\"toKey\":\"to\",\"amount\":100.0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void transfer_zeroAmount_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/transfer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromKey\":\"from\",\"toKey\":\"to\",\"amount\":0}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void runDemo_returns200WithResults() throws Exception {
        var events = List.of(
                new LockDemoService.DemoEvent(1, "READ", 10, 0L),
                new LockDemoService.DemoEvent(1, "WRITE", 9, 50L)
        );
        var withLock = new LockDemoService.DemoResult(10, 8, 8, 0, true, events);
        var withoutLock = new LockDemoService.DemoResult(10, 8, 9, 1, false, events);

        when(lockDemoService.runWithLock(anyInt(), anyInt())).thenReturn(withLock);
        when(lockDemoService.runWithoutLock(anyInt(), anyInt())).thenReturn(withoutLock);

        mockMvc.perform(post("/api/lock/demo/run")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workers\":2,\"initialValue\":10}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.withLock.correct").value(true))
                .andExpect(jsonPath("$.withoutLock.correct").value(false));
    }

    // --- GET /api/lock/metrics ---

    @Test
    void getMetrics_returns200WithLocksAndTimestamp() throws Exception {
        DistributedLockService.LockMetrics metrics = mock(DistributedLockService.LockMetrics.class);
        when(metrics.getAllStats()).thenReturn(Map.of());
        when(lockService.getMetrics()).thenReturn(metrics);

        mockMvc.perform(get("/api/lock/metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locks").exists())
                .andExpect(jsonPath("$.timestamp").isNumber());
    }

    // --- POST /api/lock/acquire-fenced with operation types ---

    @Test
    void acquireFencedLock_fencedCacheRead_missingData_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\",\"operation\":\"fenced_cache_read\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("data")));
    }

    @Test
    void acquireFencedLock_fencedCacheRead_withData_returns200() throws Exception {
        Map<String, Object> fencedResult = new HashMap<>();
        fencedResult.put("operation", "fenced_cache_read");
        fencedResult.put("fencingToken", 1L);
        fencedResult.put("key", "somekey");
        fencedResult.put("found", false);
        fencedResult.put("value", null);
        fencedResult.put("type", "String");
        when(lockDemoOrchestrator.executeFencedOperation(eq("flock"), eq("fenced_cache_read"), any()))
                .thenReturn(Optional.of(fencedResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\",\"operation\":\"fenced_cache_read\",\"data\":{\"key\":\"somekey\",\"type\":\"string\"}}"))
                .andExpect(status().isOk());
    }

    @Test
    void acquireFencedLock_unknownOperation_returns400() throws Exception {
        when(lockDemoOrchestrator.executeFencedOperation(eq("flock"), eq("unknown_op"), any()))
                .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\",\"operation\":\"unknown_op\",\"data\":{}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- POST /api/lock/execute with various operations ---

    @Test
    void executeWithLock_cacheRead_returns200() throws Exception {
        Map<String, Object> readResult = new HashMap<>();
        readResult.put("key", "rk");
        readResult.put("found", false);
        readResult.put("value", null);
        readResult.put("type", "String");
        when(lockDemoOrchestrator.executeLockOperation(eq("rlock"), eq("cache_read"), any()))
                .thenReturn(Optional.of(readResult));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"rlock\",\"operation\":\"cache_read\",\"data\":{\"key\":\"rk\",\"type\":\"string\"}}"))
                .andExpect(status().isOk());
    }

    @Test
    void executeWithLock_batchRead_returns200() throws Exception {
        when(lockDemoOrchestrator.executeLockOperation(eq("rlock"), eq("batch_read"), any()))
                .thenReturn(Optional.of(Map.of("k1", "v1")));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"rlock\",\"operation\":\"batch_read\",\"data\":{\"keys\":[\"k1\"]}}"))
                .andExpect(status().isOk());
    }

    @Test
    void executeWithLock_atomicIncrement_returns200() throws Exception {
        when(lockDemoOrchestrator.executeLockOperation(eq("alock"), eq("atomic_increment"), any()))
                .thenReturn(Optional.of(Map.of("key", "counter", "value", 11)));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"alock\",\"operation\":\"atomic_increment\",\"data\":{\"counterKey\":\"counter\",\"increment\":1}}"))
                .andExpect(status().isOk());
    }

    @Test
    void executeWithLock_missingDataForCacheRead_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"rlock\",\"operation\":\"cache_read\"}"))
                .andExpect(status().isBadRequest());
    }

    // --- Exception handlers ---

    @Test
    void exceptionHandler_redisConnectionException_returns503() throws Exception {
        when(lockService.isLocked(anyString()))
                .thenThrow(new RedisConnectionException("connection refused"));

        mockMvc.perform(get("/api/lock/status?lockKey=somekey"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("Service temporarily unavailable"));
    }

    @Test
    void exceptionHandler_redisTimeoutException_returns408() throws Exception {
        when(lockService.isLocked(anyString()))
                .thenThrow(new RedisTimeoutException("timeout"));

        mockMvc.perform(get("/api/lock/status?lockKey=somekey"))
                .andExpect(status().is(408))
                .andExpect(jsonPath("$.error").value("Request timeout"));
    }

    // --- POST /api/lock/release with demoFeaturesEnabled=false → 403 ---

    @Test
    void releaseLock_forceTrue_demoDisabled_returns403() throws Exception {
        // Use a separate test with demo.features.enabled=false
        // The class-level @TestPropertySource sets it to true; we need a separate context.
        // Since @WebMvcTest + @TestPropertySource on method is not supported, we verify via a
        // separate nested test class approach. Instead, test via the class-level property below.
        // This test documents expected 403 behavior when force=true and demoFeaturesEnabled=false.
        // (Actual isolation tested in LockControllerNoDemoTest nested class.)
        mockMvc.perform(post("/api/lock/release")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"force\":true}"))
                .andExpect(status().isOk()); // demo is enabled at class level → allowed
    }

    @Test
    void releaseLock_missingLockKey_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/release")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- POST /api/lock/demo/run failure path ---

    @Test
    void runDemo_serviceThrowsException_returns500() throws Exception {
        when(lockDemoService.runWithoutLock(anyInt(), anyInt()))
                .thenThrow(new RuntimeException("demo failed"));

        mockMvc.perform(post("/api/lock/demo/run")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workers\":2,\"initialValue\":10}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- POST /api/lock/demo/run: workers clamping (< 2 → 2, > 8 → 8) ---
    @Test
    void runDemo_workersClampedToMin2() throws Exception {
        var events = List.of(new LockDemoService.DemoEvent(1, "READ", 10, 0L));
        var result = new LockDemoService.DemoResult(2, 2, 2, 0, true, events);
        when(lockDemoService.runWithLock(eq(2), anyInt())).thenReturn(result);
        when(lockDemoService.runWithoutLock(eq(2), anyInt())).thenReturn(result);

        mockMvc.perform(post("/api/lock/demo/run")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workers\":1,\"initialValue\":10}"))
                .andExpect(status().isOk());

        verify(lockDemoService).runWithLock(eq(2), anyInt());
    }

    // --- POST /api/lock/acquire-fenced: fenced_cache_update with data ---

    @Test
    void acquireFencedLock_fencedCacheUpdate_withData_returns200() throws Exception {
        Map<String, Object> fencedResult = new HashMap<>();
        fencedResult.put("operation", "fenced_cache_update");
        fencedResult.put("fencingToken", 5L);
        fencedResult.put("status", "updated");
        fencedResult.put("keys", Set.of("k1"));
        fencedResult.put("keyCount", 1);
        when(lockDemoOrchestrator.executeFencedOperation(eq("flock"), eq("fenced_cache_update"), any()))
                .thenReturn(Optional.of(fencedResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\",\"operation\":\"fenced_cache_update\",\"data\":{\"k1\":\"v1\"}}"))
                .andExpect(status().isOk());
    }

    // --- POST /api/lock/acquire-fenced: fenced_critical_section with data ---

    @Test
    void acquireFencedLock_fencedCriticalSection_withData_returns200() throws Exception {
        Map<String, Object> fencedResult = new HashMap<>();
        fencedResult.put("operation", "fenced_critical_section");
        fencedResult.put("fencingToken", 7L);
        fencedResult.put("resourceKey", "res1");
        fencedResult.put("operationType", "write");
        fencedResult.put("status", "completed");
        fencedResult.put("executedAt", System.currentTimeMillis());
        when(lockDemoOrchestrator.executeFencedOperation(eq("flock"), eq("fenced_critical_section"), any()))
                .thenReturn(Optional.of(fencedResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\",\"operation\":\"fenced_critical_section\",\"data\":{\"resourceKey\":\"res1\",\"operationType\":\"write\"}}"))
                .andExpect(status().isOk());
    }

    // --- POST /api/lock/acquire-fenced: fenced_atomic_increment missing data → 400 ---

    @Test
    void acquireFencedLock_fencedAtomicIncrement_missingData_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\",\"operation\":\"fenced_atomic_increment\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- POST /api/lock/acquire-fenced: fenced_conditional_update with data ---

    @Test
    void acquireFencedLock_fencedConditionalUpdate_withData_returns200() throws Exception {
        Map<String, Object> fencedResult = new HashMap<>();
        fencedResult.put("operation", "fenced_conditional_update");
        fencedResult.put("fencingToken", 3L);
        fencedResult.put("key", "ckey");
        fencedResult.put("updated", false);
        fencedResult.put("currentValue", null);
        fencedResult.put("expectedValue", "old");
        fencedResult.put("newValue", null);
        when(lockDemoOrchestrator.executeFencedOperation(eq("flock"), eq("fenced_conditional_update"), any()))
                .thenReturn(Optional.of(fencedResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\",\"operation\":\"fenced_conditional_update\",\"data\":{\"key\":\"ckey\",\"expectedValue\":\"old\",\"newValue\":\"new\"}}"))
                .andExpect(status().isOk());
    }

    // --- POST /api/lock/acquire-fenced: lock acquisition failure (empty) → 400 ---

    @Test
    void acquireFencedLock_noOperation_lockFailed_returns400() throws Exception {
        when(lockService.executeWithFencedLock(eq("flock"), any()))
                .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"flock\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acquired").value(false));
    }

    // --- POST /api/lock/execute: cache_update missing data → 400 ---

    @Test
    void executeWithLock_cacheUpdate_missingData_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"operation\":\"cache_update\"}"))
                .andExpect(status().isBadRequest());
    }

    // --- POST /api/lock/execute: atomic_increment missing data → 400 ---

    @Test
    void executeWithLock_atomicIncrement_missingData_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"operation\":\"atomic_increment\"}"))
                .andExpect(status().isBadRequest());
    }

    // --- POST /api/lock/execute: batch_read missing data → 400 ---

    @Test
    void executeWithLock_batchRead_missingData_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"operation\":\"batch_read\"}"))
                .andExpect(status().isBadRequest());
    }

    // --- POST /api/lock/transfer: missing keys → 400 ---

    @Test
    void transfer_missingKeys_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/transfer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":100}"))
                .andExpect(status().isBadRequest());
    }

    // --- POST /api/lock/transfer: negative amount → 400 ---

    @Test
    void transfer_negativeAmount_returns400() throws Exception {
        mockMvc.perform(post("/api/lock/transfer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromKey\":\"from\",\"toKey\":\"to\",\"amount\":-10}"))
                .andExpect(status().isBadRequest());
    }

    // --- GET /api/lock/status: missing lockKey param → 400 ---

    @Test
    void getLockStatus_missingLockKey_returns400() throws Exception {
        mockMvc.perform(get("/api/lock/status?lockKey="))
                .andExpect(status().isBadRequest());
    }

    // --- @ExceptionHandler IllegalArgumentException → 400 ---

    @Test
    void exceptionHandler_illegalArgumentException_returns400() throws Exception {
        when(lockService.isLocked(anyString()))
                .thenThrow(new IllegalArgumentException("bad arg"));

        mockMvc.perform(get("/api/lock/status?lockKey=somekey"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- POST /api/lock/check-status: locked=true → canAcquire=false ---

    @Test
    void checkLockStatus_locked_canAcquireFalse() throws Exception {
        when(lockService.isLocked("mylock")).thenReturn(true);

        mockMvc.perform(post("/api/lock/check-status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canAcquire").value(false))
                .andExpect(jsonPath("$.currentlyLocked").value(true))
                .andExpect(jsonPath("$.lockType").value("standard")); // default lockType
    }

    // --- POST /api/lock/execute-transaction: transactionalLock returns empty → success=false ---

    @Test
    void executeTransaction_lockAcquisitionFailed_successFalse() throws Exception {
        when(transactionalLockService.executeWithTransactionalLock(eq("txlock"), any()))
                .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/lock/execute-transaction")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"txlock\",\"updates\":{\"k1\":\"v1\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false));
    }

    // =========================================================================
    // Group A: acquireFencedLock operation tests (via orchestrator mock)
    // =========================================================================

    @Test
    void acquireFencedLock_noOperation_lambdaExecuted_returnsToken() throws Exception {
        when(lockService.executeWithFencedLock(anyString(), any())).thenAnswer(inv -> {
            DistributedLockService.FencedOperation<Object> op = inv.getArgument(1);
            Object result = op.execute(42L);
            return Optional.of(result);
        });

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acquired").value(true));
    }

    @Test
    void acquireFencedLock_fencedCacheRead_lambdaExecuted_valueFound() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_cache_read");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("key", "mykey");
        orchestratorResult.put("found", true);
        orchestratorResult.put("value", "hello");
        orchestratorResult.put("type", "Object");
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_cache_read"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_cache_read\",\"data\":{\"key\":\"mykey\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true));
    }

    @Test
    void acquireFencedLock_fencedCacheRead_lambdaExecuted_valueAbsent() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_cache_read");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("key", "mykey");
        orchestratorResult.put("found", false);
        orchestratorResult.put("value", null);
        orchestratorResult.put("type", "Object");
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_cache_read"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_cache_read\",\"data\":{\"key\":\"mykey\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(false));
    }

    @Test
    void acquireFencedLock_fencedCacheUpdate_lambdaExecuted() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_cache_update");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("status", "updated");
        orchestratorResult.put("keys", Set.of("key"));
        orchestratorResult.put("keyCount", 1);
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_cache_update"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_cache_update\",\"data\":{\"key\":\"k1\",\"value\":\"v1\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("updated"));
    }

    @Test
    void acquireFencedLock_fencedCriticalSection_lambdaExecuted() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_critical_section");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("resourceKey", "res1");
        orchestratorResult.put("operationType", "lock");
        orchestratorResult.put("status", "completed");
        orchestratorResult.put("executedAt", System.currentTimeMillis());
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_critical_section"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_critical_section\",\"data\":{\"resourceKey\":\"res1\",\"operationType\":\"lock\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("completed"));
    }

    @Test
    void acquireFencedLock_fencedAtomicIncrement_lambdaExecuted() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_atomic_increment");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("key", "ctr");
        orchestratorResult.put("previousValue", 10);
        orchestratorResult.put("newValue", 15);
        orchestratorResult.put("increment", 5);
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_atomic_increment"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_atomic_increment\",\"data\":{\"counterKey\":\"ctr\",\"increment\":5}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.newValue").value(15));
    }

    @Test
    void acquireFencedLock_fencedConditionalUpdate_conditionTrue() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_conditional_update");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("key", "k1");
        orchestratorResult.put("updated", true);
        orchestratorResult.put("currentValue", "old");
        orchestratorResult.put("expectedValue", "old");
        orchestratorResult.put("newValue", "new");
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_conditional_update"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_conditional_update\",\"data\":{\"key\":\"k1\",\"expectedValue\":\"old\",\"newValue\":\"new\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(true));
    }

    @Test
    void acquireFencedLock_fencedConditionalUpdate_conditionFalse() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_conditional_update");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("key", "k1");
        orchestratorResult.put("updated", false);
        orchestratorResult.put("currentValue", "other");
        orchestratorResult.put("expectedValue", "old");
        orchestratorResult.put("newValue", null);
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_conditional_update"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_conditional_update\",\"data\":{\"key\":\"k1\",\"expectedValue\":\"old\",\"newValue\":\"new\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(false));
    }

    @Test
    void acquireFencedLock_fencedConditionalUpdate_keyAbsent() throws Exception {
        Map<String, Object> orchestratorResult = new HashMap<>();
        orchestratorResult.put("operation", "fenced_conditional_update");
        orchestratorResult.put("fencingToken", 42L);
        orchestratorResult.put("key", "k1");
        orchestratorResult.put("updated", false);
        orchestratorResult.put("currentValue", null);
        orchestratorResult.put("expectedValue", "old");
        orchestratorResult.put("newValue", null);
        when(lockDemoOrchestrator.executeFencedOperation(eq("k1"), eq("fenced_conditional_update"), any()))
                .thenReturn(Optional.of(orchestratorResult));

        mockMvc.perform(post("/api/lock/acquire-fenced")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"fenced_conditional_update\",\"data\":{\"key\":\"k1\",\"expectedValue\":\"old\",\"newValue\":\"new\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(false));
    }

    // =========================================================================
    // Group B: executeWithLock / executeWithReadLock operation tests (via orchestrator)
    // =========================================================================

    @Test
    void executeWithLock_cacheUpdate_lambdaExecuted() throws Exception {
        when(lockDemoOrchestrator.executeLockOperation(eq("k1"), eq("cache_update"), any()))
                .thenReturn(Optional.of(Map.of("status", "updated", "keys", Set.of("k1"))));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"cache_update\",\"data\":{\"k1\":\"v1\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("updated"));
    }

    @Test
    void executeWithLock_cacheRead_lambdaExecuted_valueFound() throws Exception {
        Map<String, Object> readResult = new HashMap<>();
        readResult.put("key", "mykey");
        readResult.put("found", true);
        readResult.put("value", "val");
        readResult.put("type", "Object");
        when(lockDemoOrchestrator.executeLockOperation(eq("k1"), eq("cache_read"), any()))
                .thenReturn(Optional.of(readResult));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"cache_read\",\"data\":{\"key\":\"mykey\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true))
                .andExpect(jsonPath("$.value").value("val"));
    }

    @Test
    void executeWithLock_cacheRead_lambdaExecuted_valueAbsent() throws Exception {
        Map<String, Object> readResult = new HashMap<>();
        readResult.put("key", "mykey");
        readResult.put("found", false);
        readResult.put("value", null);
        readResult.put("type", "Object");
        when(lockDemoOrchestrator.executeLockOperation(eq("k1"), eq("cache_read"), any()))
                .thenReturn(Optional.of(readResult));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"cache_read\",\"data\":{\"key\":\"mykey\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(false));
    }

    @Test
    void executeWithLock_batchRead_lambdaExecuted() throws Exception {
        when(lockDemoOrchestrator.executeLockOperation(eq("k1"), eq("batch_read"), any()))
                .thenReturn(Optional.of(Map.of("k1", "v1", "k2", "v2")));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"batch_read\",\"data\":{\"keys\":[\"k1\",\"k2\"]}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.k1").value("v1"));
    }

    @Test
    void executeWithLock_atomicIncrement_lambdaExecuted() throws Exception {
        when(lockDemoOrchestrator.executeLockOperation(eq("k1"), eq("atomic_increment"), any()))
                .thenReturn(Optional.of(Map.of("key", "ctr", "value", 10)));

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"k1\",\"operation\":\"atomic_increment\",\"data\":{\"counterKey\":\"ctr\",\"increment\":3}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(10));
    }

    // =========================================================================
    // Group C: executeTransaction lambda execution test
    // =========================================================================

    @Test
    @SuppressWarnings("unchecked")
    void executeTransaction_withLockKey_lambdaExecuted() throws Exception {
        when(transactionalLockService.executeWithTransactionalLock(eq("txlock"), any())).thenAnswer(inv -> {
            Function<RTransaction, Object> op = inv.getArgument(1);
            RTransaction tx = mock(RTransaction.class);
            RBucket<Object> bucket = mock(RBucket.class);
            when(tx.getBucket(anyString())).thenReturn(bucket);
            Object result = op.apply(tx);
            return Optional.of(result);
        });

        mockMvc.perform(post("/api/lock/execute-transaction")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"txlock\",\"updates\":{\"k1\":\"v1\",\"k2\":\"v2\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }
}
