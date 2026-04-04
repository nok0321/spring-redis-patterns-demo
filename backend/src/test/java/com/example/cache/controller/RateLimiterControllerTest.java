package com.example.cache.controller;

import com.example.cache.service.RateLimiterDemoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(RateLimiterController.class)
@AutoConfigureMockMvc(addFilters = false)
class RateLimiterControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    RateLimiterDemoService rateLimiterDemoService;

    @Test
    void getStatus_returnsAllFields() throws Exception {
        var status = new RateLimiterDemoService.RateLimiterStatus(10, 0, 1000L, 100);
        when(rateLimiterDemoService.getRateLimiterStatus()).thenReturn(status);

        mockMvc.perform(get("/api/rate-limiter/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availablePermissions").value(10))
                .andExpect(jsonPath("$.limitForPeriod").value(100))
                .andExpect(jsonPath("$.cyclePeriodMs").value(1000))
                .andExpect(jsonPath("$.numberOfWaitingThreads").value(0));
    }

    @Test
    void flood_validRequest_returnsFloodResult() throws Exception {
        var events = List.of(
                new RateLimiterDemoService.FloodEvent(1, true, 10L),
                new RateLimiterDemoService.FloodEvent(2, false, 15L)
        );
        var result = new RateLimiterDemoService.FloodResult(6, 4, 2, events);
        when(rateLimiterDemoService.executeFlood(5, 3)).thenReturn(result);

        mockMvc.perform(post("/api/rate-limiter/flood")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workers\":5,\"burstCount\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requested").value(6))
                .andExpect(jsonPath("$.permitted").value(4))
                .andExpect(jsonPath("$.rejected").value(2));
    }

    @Test
    void flood_workersOutOfRange_returns400() throws Exception {
        mockMvc.perform(post("/api/rate-limiter/flood")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workers\":25,\"burstCount\":3}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void flood_burstCountOutOfRange_returns400() throws Exception {
        mockMvc.perform(post("/api/rate-limiter/flood")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workers\":5,\"burstCount\":25}"))
                .andExpect(status().isBadRequest());
    }
}
