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
class SecurityConfigDevModeIT {

    @Container
    static GenericContainer<?> redis =
            new GenericContainer<>("redis:alpine").withExposedPorts(6379);

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry r) {
        r.add("REDIS_HOST", redis::getHost);
        r.add("REDIS_PORT", () -> redis.getMappedPort(6379).toString());
        r.add("REDIS_PASSWORD", () -> "");
        r.add("api.key", () -> "");
        r.add("demo.features.enabled", () -> "true");
    }

    @Autowired
    MockMvc mockMvc;

    @Test
    void api_endpoint_accessible_without_auth_in_dev_mode() throws Exception {
        mockMvc.perform(get("/api/cache/search").param("pattern", "*"))
                .andExpect(status().isOk());
    }

    @Test
    void admin_endpoint_accessible_without_auth_in_dev_mode() throws Exception {
        mockMvc.perform(post("/api/cache/simulate-error")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\": true}"))
                .andExpect(status().isOk());
    }
}
