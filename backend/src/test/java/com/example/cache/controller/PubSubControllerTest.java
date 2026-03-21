package com.example.cache.controller;

import com.example.cache.service.PubSubService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PubSubController.class)
class PubSubControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    PubSubService pubSubService;

    @Test
    void publish_validMessage_returns200() throws Exception {
        when(pubSubService.publish(eq("default"), eq("hello"))).thenReturn(1L);

        mockMvc.perform(post("/api/pubsub/publish")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"default\",\"message\":\"hello\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subscribers").value(1))
                .andExpect(jsonPath("$.message").value("hello"));

        verify(pubSubService).addSubscriber("default");
    }

    @Test
    void publish_blankMessage_returns400() throws Exception {
        mockMvc.perform(post("/api/pubsub/publish")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"default\",\"message\":\"  \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void publish_emptyMessage_returns400() throws Exception {
        mockMvc.perform(post("/api/pubsub/publish")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"default\",\"message\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void subscribe_normal_returnsSseEmitter() throws Exception {
        SseEmitter emitter = new SseEmitter();
        when(pubSubService.createEmitter()).thenReturn(emitter);

        mockMvc.perform(get("/api/pubsub/subscribe"))
                .andExpect(status().isOk());

        verify(pubSubService).createEmitter();
    }

    @Test
    void subscribe_limitExceeded_returns503() throws Exception {
        when(pubSubService.createEmitter())
                .thenThrow(new IllegalStateException("SSE connection limit reached (100)"));

        mockMvc.perform(get("/api/pubsub/subscribe"))
                .andExpect(status().isServiceUnavailable());
    }
}
