package com.example.cache.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class LockDemoServiceIT {

    @Container
    static GenericContainer<?> redis =
            new GenericContainer<>("redis:alpine").withExposedPorts(6379);

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry r) {
        r.add("REDIS_HOST", redis::getHost);
        r.add("REDIS_PORT", () -> redis.getMappedPort(6379).toString());
        r.add("REDIS_PASSWORD", () -> "");
    }

    @Autowired
    LockDemoService lockDemoService;

    @Test
    void runWithLock_finalValueEqualsExpected() throws Exception {
        var result = lockDemoService.runWithLock(3, 10);

        assertThat(result.correct()).isTrue();
        assertThat(result.actualFinal()).isEqualTo(result.expectedFinal());
        assertThat(result.events()).isNotEmpty();
    }

    @Test
    void runWithoutLock_eventsAreNotEmpty() throws Exception {
        var result = lockDemoService.runWithoutLock(3, 10);

        assertThat(result.events()).isNotEmpty();
        assertThat(result.initialValue()).isEqualTo(10);
        assertThat(result.expectedFinal()).isEqualTo(7);
    }
}
