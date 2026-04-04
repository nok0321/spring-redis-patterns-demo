package com.example.cache.controller;

import com.example.cache.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.*;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(LockController.class)
@TestPropertySource(properties = "demo.features.enabled=true")
class LockControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    DistributedLockService lockService;

    @MockitoBean
    TransactionalLockService transactionalLockService;

    @MockitoBean
    ResilientCacheService cacheService;

    @MockitoBean
    LockDemoService lockDemoService;

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
        when(lockService.executeWithLock(eq("mylock"), any())).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/lock/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockKey\":\"mylock\",\"operation\":\"unknown_op\",\"data\":{}}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeWithLock_cacheUpdate_returns200() throws Exception {
        when(lockService.executeWithLock(eq("mylock"), any()))
                .thenReturn(Optional.of(Map.of("status", "updated", "keys", Set.of("k1"))));
        when(cacheService.setAsync(anyString(), any(), any()))
                .thenReturn(java.util.concurrent.CompletableFuture.completedFuture(true));

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
}
