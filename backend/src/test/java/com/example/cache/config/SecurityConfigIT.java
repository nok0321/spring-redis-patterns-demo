package com.example.cache.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("test")
class SecurityConfigIT {

    private static final String TEST_API_KEY = "test-api-key-12345";

    @Container
    static GenericContainer<?> redis =
            new GenericContainer<>("redis:alpine").withExposedPorts(6379);

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry r) {
        r.add("REDIS_HOST", redis::getHost);
        r.add("REDIS_PORT", () -> redis.getMappedPort(6379).toString());
        r.add("REDIS_PASSWORD", () -> "");
        r.add("api.key", () -> TEST_API_KEY);
        r.add("demo.features.enabled", () -> "true");
    }

    @Autowired
    MockMvc mockMvc;

    // --- Public endpoints (no auth required) ---

    @Test
    void health_endpoint_accessible_without_auth() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk());
    }

    // --- Protected endpoints (require valid API key) ---

    @Test
    void api_endpoint_rejected_without_api_key() throws Exception {
        mockMvc.perform(get("/api/cache/search").param("pattern", "*"))
                .andExpect(status().isForbidden());
    }

    @Test
    void api_endpoint_rejected_with_invalid_api_key() throws Exception {
        mockMvc.perform(get("/api/cache/search")
                        .param("pattern", "*")
                        .header("X-API-Key", "wrong-key"))
                .andExpect(status().isForbidden());
    }

    @Test
    void api_endpoint_returns_200_with_valid_api_key() throws Exception {
        mockMvc.perform(get("/api/cache/search")
                        .param("pattern", "*")
                        .header("X-API-Key", TEST_API_KEY))
                .andExpect(status().isOk());
    }

    // --- DEMO_ADMIN endpoints ---

    @Test
    void admin_endpoint_accessible_with_valid_api_key() throws Exception {
        mockMvc.perform(post("/api/cache/simulate-error")
                        .header("X-API-Key", TEST_API_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\": true}"))
                .andExpect(status().isOk());
    }

    @Test
    void admin_endpoint_rejected_without_api_key() throws Exception {
        mockMvc.perform(post("/api/cache/simulate-error")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\": true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void lock_release_admin_endpoint_rejected_without_api_key() throws Exception {
        mockMvc.perform(post("/api/lock/release"))
                .andExpect(status().isForbidden());
    }

    // --- Actuator endpoints ---

    @Test
    void actuator_health_accessible_without_auth() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
    }

    @Test
    void actuator_prometheus_rejected_without_api_key() throws Exception {
        mockMvc.perform(get("/actuator/prometheus"))
                .andExpect(status().isForbidden());
    }

    @Test
    void actuator_prometheus_accessible_with_valid_api_key() throws Exception {
        mockMvc.perform(get("/actuator/prometheus")
                        .header("X-API-Key", TEST_API_KEY))
                .andExpect(status().isOk());
    }

    @Test
    void actuator_metrics_rejected_without_api_key() throws Exception {
        mockMvc.perform(get("/actuator/metrics"))
                .andExpect(status().isForbidden());
    }
}
