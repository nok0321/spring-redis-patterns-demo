package com.example.cache.controller;

import com.example.cache.service.TransactionalLockService;
import org.junit.jupiter.api.Test;
import org.redisson.api.RTransaction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TransactionController.class)
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
}
