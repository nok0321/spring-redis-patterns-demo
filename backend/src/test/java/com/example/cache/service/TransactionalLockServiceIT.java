package com.example.cache.service;

import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class TransactionalLockServiceIT {

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
    TransactionalLockService transactionalLockService;

    @Autowired
    RedissonClient redissonClient;

    @Test
    void executeInTransaction_commit_persistsData() {
        String key = "tx:test:key";
        Optional<String> result = transactionalLockService.executeInTransaction(tx -> {
            tx.<String>getBucket(key).set("txvalue");
            return "done";
        });

        assertThat(result).isPresent().contains("done");
        String stored = redissonClient.<String>getBucket(key).get();
        assertThat(stored).isEqualTo("txvalue");
    }

    @Test
    void executeInTransaction_exceptionCausesRollback() {
        String key = "tx:test:rollback";
        Optional<String> result = transactionalLockService.executeInTransaction(tx -> {
            tx.<String>getBucket(key).set("should-be-rolled-back");
            throw new RuntimeException("forced failure");
        });

        assertThat(result).isEmpty();
    }

    @Test
    void executeBatchWithTransaction_atomicUpdate() {
        boolean success = transactionalLockService.executeBatchWithTransaction(
                Map.of("batch:k1", "bv1", "batch:k2", "bv2")
        );

        assertThat(success).isTrue();
        assertThat(redissonClient.<String>getBucket("batch:k1").get()).isEqualTo("bv1");
        assertThat(redissonClient.<String>getBucket("batch:k2").get()).isEqualTo("bv2");
    }

    @Test
    void executeTransfer_success_updatesBalances() {
        String from = "tx:balance:from";
        String to = "tx:balance:to";
        redissonClient.<Double>getBucket(from).set(1000.0);
        redissonClient.<Double>getBucket(to).set(500.0);

        boolean ok = transactionalLockService.executeTransfer(from, to, 200.0, "transfer-test-1");
        assertThat(ok).isTrue();
    }

    @Test
    void executeTransfer_insufficientBalance_returnsFalse() {
        String from = "tx:balance:poor";
        String to = "tx:balance:rich";
        redissonClient.<Double>getBucket(from).set(50.0);
        redissonClient.<Double>getBucket(to).set(1000.0);

        boolean ok = transactionalLockService.executeTransfer(from, to, 100.0, "transfer-test-2");
        assertThat(ok).isFalse();
    }

    @Test
    void getStats_recordsTransactions() {
        transactionalLockService.getStats().reset();
        transactionalLockService.executeInTransaction(tx -> {
            tx.<String>getBucket("stats:test").set("val");
            return "ok";
        });

        var statsMap = transactionalLockService.getStats().getStats();
        assertThat(statsMap.get("total")).isGreaterThan(0L);
        assertThat(statsMap.get("successful")).isGreaterThan(0L);
    }
}
