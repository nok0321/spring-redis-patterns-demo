package com.example.cache.service;

import org.redisson.api.RBucket;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * 分散ロックの効果を示すカウンタ競合デモサービス。
 * N 個のワーカーが同じカウンタを同時にデクリメントする際の
 * ロックあり・なしの挙動を比較する。
 */
@Service
public class LockDemoService {

    private static final Logger logger = LoggerFactory.getLogger(LockDemoService.class);
    private static final String DEMO_COUNTER_KEY = "demo:race:counter";
    private static final String DEMO_LOCK_KEY    = "demo:race:lock";

    private final RedissonClient redissonClient;

    public LockDemoService(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    public record DemoEvent(
        int workerId,
        String step,   // READ | WRITE | LOCK_WAITING | LOCK_ACQUIRED | LOCK_RELEASED
        int value,
        long relativeMs
    ) {}

    public record DemoResult(
        int initialValue,
        int expectedFinal,
        int actualFinal,
        int lostUpdates,
        boolean correct,
        List<DemoEvent> events
    ) {}

    // ----------------------------------------------------------------
    // ロックなし実行
    // ----------------------------------------------------------------
    public DemoResult runWithoutLock(int workers, int initialValue) throws Exception {
        redissonClient.<Integer>getBucket(DEMO_COUNTER_KEY).set(initialValue, Duration.ofSeconds(30));
        List<DemoEvent> events = Collections.synchronizedList(new ArrayList<>());
        long startMs = System.currentTimeMillis();

        CountDownLatch ready  = new CountDownLatch(workers);
        CountDownLatch go     = new CountDownLatch(1);
        CountDownLatch done   = new CountDownLatch(workers);

        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 1; i <= workers; i++) {
                final int id = i;
                pool.submit(() -> {
                    try {
                        ready.countDown();
                        go.await();

                        // 全員同時に読む → 競合の温床
                        RBucket<Integer> bucket = redissonClient.getBucket(DEMO_COUNTER_KEY);
                        Integer readBoxed = bucket.get();
                        int read = readBoxed != null ? readBoxed : 0;
                        events.add(new DemoEvent(id, "READ", read,
                                System.currentTimeMillis() - startMs));

                        // 少し計算時間を模倣してから書き込む
                        Thread.sleep(50);

                        int newVal = read - 1;
                        bucket.set(newVal, Duration.ofSeconds(30));
                        events.add(new DemoEvent(id, "WRITE", newVal,
                                System.currentTimeMillis() - startMs));

                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }

            ready.await(5, TimeUnit.SECONDS);
            go.countDown();
            done.await(15, TimeUnit.SECONDS);
        }

        Integer actualBoxed = redissonClient.<Integer>getBucket(DEMO_COUNTER_KEY).get();
        int actualFinal  = actualBoxed != null ? actualBoxed : 0;
        int expectedFinal = initialValue - workers;
        int lostUpdates   = actualFinal - expectedFinal; // 正数なら更新が失われた数

        events.sort((a, b) -> Long.compare(a.relativeMs(), b.relativeMs()));
        return new DemoResult(initialValue, expectedFinal, actualFinal, lostUpdates,
                actualFinal == expectedFinal, events);
    }

    // ----------------------------------------------------------------
    // ロックあり実行
    // ----------------------------------------------------------------
    public DemoResult runWithLock(int workers, int initialValue) throws Exception {
        redissonClient.<Integer>getBucket(DEMO_COUNTER_KEY).set(initialValue, Duration.ofSeconds(30));
        List<DemoEvent> events = Collections.synchronizedList(new ArrayList<>());
        long startMs = System.currentTimeMillis();

        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch go    = new CountDownLatch(1);
        CountDownLatch done  = new CountDownLatch(workers);

        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 1; i <= workers; i++) {
                final int id = i;
                pool.submit(() -> {
                    try {
                        ready.countDown();
                        go.await();

                        RLock lock = redissonClient.getLock(DEMO_LOCK_KEY);
                        events.add(new DemoEvent(id, "LOCK_WAITING", -1,
                                System.currentTimeMillis() - startMs));

                        boolean acquired = lock.tryLock(10, 5, TimeUnit.SECONDS);
                        if (!acquired) {
                            logger.warn("Worker {} could not acquire lock", id);
                            return;
                        }

                        try {
                            events.add(new DemoEvent(id, "LOCK_ACQUIRED", -1,
                                    System.currentTimeMillis() - startMs));

                            RBucket<Integer> bucket = redissonClient.getBucket(DEMO_COUNTER_KEY);
                            Integer readBoxed = bucket.get();
                            int read = readBoxed != null ? readBoxed : 0;
                            events.add(new DemoEvent(id, "READ", read,
                                    System.currentTimeMillis() - startMs));

                            Thread.sleep(50);

                            int newVal = read - 1;
                            bucket.set(newVal, Duration.ofSeconds(30));
                            events.add(new DemoEvent(id, "WRITE", newVal,
                                    System.currentTimeMillis() - startMs));

                        } finally {
                            lock.unlock();
                            events.add(new DemoEvent(id, "LOCK_RELEASED", -1,
                                    System.currentTimeMillis() - startMs));
                        }

                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }

            ready.await(5, TimeUnit.SECONDS);
            go.countDown();
            done.await(30, TimeUnit.SECONDS);
        }

        Integer actualBoxed = redissonClient.<Integer>getBucket(DEMO_COUNTER_KEY).get();
        int actualFinal  = actualBoxed != null ? actualBoxed : 0;
        int expectedFinal = initialValue - workers;
        int lostUpdates   = actualFinal - expectedFinal;

        events.sort((a, b) -> Long.compare(a.relativeMs(), b.relativeMs()));
        return new DemoResult(initialValue, expectedFinal, actualFinal, lostUpdates,
                actualFinal == expectedFinal, events);
    }
}
