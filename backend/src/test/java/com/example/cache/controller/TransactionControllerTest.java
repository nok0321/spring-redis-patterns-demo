package com.example.cache.controller;

import com.example.cache.service.TransactionalLockService;
import org.junit.jupiter.api.Test;
import org.redisson.api.RBucket;
import org.redisson.api.RTransaction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.function.Function;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TransactionController.class)
@AutoConfigureMockMvc(addFilters = false)
class TransactionControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    TransactionalLockService transactionalLockService;

    @Test
    void runSaga_success_returnsStepsAndSuccessStatus() throws Exception {
        when(transactionalLockService.executeWithCompensation(any(), any()))
                .thenReturn(Optional.of("SUCCESS"));

        mockMvc.perform(post("/api/transaction/saga"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("SUCCESS"))
                .andExpect(jsonPath("$.steps").isArray());
    }

    @Test
    void runSaga_failure_returnsFailedStatus() throws Exception {
        when(transactionalLockService.executeWithCompensation(any(), any()))
                .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/transaction/saga"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("FAILED"));
    }

    @Test
    void runSagaFail_returnsCompensatedStatus() throws Exception {
        when(transactionalLockService.executeWithCompensation(any(), any()))
                .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/transaction/saga-fail"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("COMPENSATED"))
                .andExpect(jsonPath("$.compensationSteps").isArray());
    }

    @Test
    void runSagaFail_compensationItself_returnsCompensationFailed() throws Exception {
        // When the service returns a present Optional for saga-fail, overallStatus = COMPENSATION_FAILED
        when(transactionalLockService.executeWithCompensation(any(), any()))
                .thenReturn(Optional.of("anything"));

        mockMvc.perform(post("/api/transaction/saga-fail"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("COMPENSATION_FAILED"))
                .andExpect(jsonPath("$.timestamp").isNumber());
    }

    // --- Lambda body execution tests (covers saga step code inside controllers) ---

    @SuppressWarnings("unchecked")
    @Test
    void runSaga_lambdaExecuted_stepsPopulated() throws Exception {
        RTransaction mockTx = mock(RTransaction.class);
        RBucket<String> mockBucket = mock(RBucket.class);
        when(mockTx.<String>getBucket(anyString())).thenReturn(mockBucket);

        when(transactionalLockService.executeWithCompensation(any(), any())).thenAnswer(inv -> {
            Function<RTransaction, String> operation = inv.getArgument(0);
            String result = operation.apply(mockTx);
            return Optional.of(result);
        });

        mockMvc.perform(post("/api/transaction/saga"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("SUCCESS"))
                .andExpect(jsonPath("$.steps").isArray())
                .andExpect(jsonPath("$.steps.length()").value(3))
                .andExpect(jsonPath("$.steps[0].status").value("SUCCESS"))
                .andExpect(jsonPath("$.steps[1].status").value("SUCCESS"))
                .andExpect(jsonPath("$.steps[2].status").value("SUCCESS"));

        verify(mockTx, times(3)).getBucket(anyString());
    }

    @SuppressWarnings("unchecked")
    @Test
    void runSagaFail_lambdaExecuted_stepsAndCompensationPopulated() throws Exception {
        RTransaction mockTx = mock(RTransaction.class);
        RBucket<String> mockBucket = mock(RBucket.class);
        when(mockTx.<String>getBucket(anyString())).thenReturn(mockBucket);

        when(transactionalLockService.executeWithCompensation(any(), any())).thenAnswer(inv -> {
            Function<RTransaction, String> operation = inv.getArgument(0);
            Function<RTransaction, Void> compensation = inv.getArgument(1);
            try {
                operation.apply(mockTx);
                return Optional.of("should not reach");
            } catch (RuntimeException e) {
                // Main operation failed, run compensation
                compensation.apply(mockTx);
                return Optional.empty();
            }
        });

        mockMvc.perform(post("/api/transaction/saga-fail"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("COMPENSATED"))
                .andExpect(jsonPath("$.steps").isArray())
                .andExpect(jsonPath("$.steps.length()").value(2))
                .andExpect(jsonPath("$.steps[0].status").value("SUCCESS"))
                .andExpect(jsonPath("$.steps[1].status").value("FAILED"))
                .andExpect(jsonPath("$.compensationSteps").isArray())
                .andExpect(jsonPath("$.compensationSteps.length()").value(1));
    }
}
