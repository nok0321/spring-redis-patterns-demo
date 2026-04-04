package com.example.cache.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RFencedLock;
import org.redisson.api.RLock;
import org.redisson.api.RReadWriteLock;
import org.redisson.api.RedissonClient;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for DistributedLockService.
 * All Redis interactions are mocked; no running Redis instance is required.
 */
@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked")
class DistributedLockServiceTest {

    @Mock
    RedissonClient redissonClient;

    @Mock
    RLock lock;

    @Mock
    RFencedLock fencedLock;

    @Mock
    RReadWriteLock rwLock;

    @Mock
    RLock readLock;

    @Mock
    RLock writeLock;

    private ExecutorService executor;
    private DistributedLockService service;

    @BeforeEach
    void setUp() {
        // Use a real single-thread executor for test stability instead of virtual threads
        executor = Executors.newSingleThreadExecutor();
        service = new DistributedLockService(redissonClient, executor);
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    // -------------------------------------------------------------------------
    // executeWithLock (2-arg overload — delegates to 4-arg with defaults 10/30)
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithLockDefaultsTest {

        @Test
        void delegates_to_overload_with_default_waitTime_and_leaseTime() throws InterruptedException {
            when(redissonClient.getLock("key1")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithLock("key1", () -> "value");

            assertThat(result).contains("value");
            verify(lock).tryLock(10, 30, TimeUnit.SECONDS);
        }
    }

    // -------------------------------------------------------------------------
    // executeWithLock (4-arg overload)
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithLockFullTest {

        @Test
        void lockAcquired_operationSucceeds_returnsValue() throws InterruptedException {
            when(redissonClient.getLock("key1")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithLock("key1", () -> "hello", 10, 30);

            assertThat(result).contains("hello");
            verify(lock).unlock();
        }

        @Test
        void lockAcquired_operationReturnsNull_returnsEmpty() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithLock("key", () -> null, 10, 30);

            assertThat(result).isEmpty();
            verify(lock).unlock();
        }

        @Test
        void lockAcquired_operationThrows_rethrowsAndUnlocks() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            assertThatThrownBy(() ->
                    service.executeWithLock("key", () -> {
                        throw new RuntimeException("boom");
                    }, 10, 30)
            ).isInstanceOf(RuntimeException.class).hasMessage("boom");

            // unlock must still be called in the finally block
            verify(lock).unlock();
        }

        @Test
        void lockAcquired_operationThrows_metricsRecordFailure() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            try {
                service.executeWithLock("key", () -> {
                    throw new RuntimeException("fail");
                }, 10, 30);
            } catch (RuntimeException ignored) {
            }

            DistributedLockService.LockMetrics.LockStats stats =
                    service.getMetrics().getAllStats().get("key");
            assertThat(stats.operationFailures()).isEqualTo(1);
            assertThat(stats.operationSuccesses()).isEqualTo(0);
        }

        @Test
        void lockNotAcquired_tryLockFalse_returnsEmpty() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(false);
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithLock("key", () -> "x", 10, 30);

            assertThat(result).isEmpty();
            verify(lock, never()).unlock();
        }

        @Test
        void lockNotAcquired_timeoutMetricRecorded() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(false);
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            service.executeWithLock("key", () -> "x", 10, 30);

            DistributedLockService.LockMetrics.LockStats stats =
                    service.getMetrics().getAllStats().get("key");
            assertThat(stats.timeouts()).isEqualTo(1);
        }

        @Test
        void tryLockInterrupted_restoresInterruptFlag_returnsEmpty() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class)))
                    .thenThrow(new InterruptedException("interrupted"));
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithLock("key", () -> "x", 10, 30);

            assertThat(result).isEmpty();
            // Verify that interrupt flag was restored
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            // Clear it so other tests are not affected
            Thread.interrupted();
        }

        @Test
        void unlockThrows_exceptionIsSwallowed_doesNotPropagate() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);
            doThrow(new IllegalMonitorStateException("not locked")).when(lock).unlock();

            // Must not throw
            assertThatNoException().isThrownBy(() ->
                    service.executeWithLock("key", () -> "ok", 10, 30));
        }

        @Test
        void lockNotHeldByCurrentThread_unlockNotCalled() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            // Simulate lock no longer held (e.g., lease expired before finally)
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            service.executeWithLock("key", () -> "ok", 10, 30);

            verify(lock, never()).unlock();
        }

        @Test
        void metricsRecordAttemptAndAcquiredAndSuccess() throws InterruptedException {
            when(redissonClient.getLock("key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            service.executeWithLock("key", () -> "result", 10, 30);

            DistributedLockService.LockMetrics.LockStats stats =
                    service.getMetrics().getAllStats().get("key");
            assertThat(stats.attempts()).isEqualTo(1);
            assertThat(stats.acquisitions()).isEqualTo(1);
            assertThat(stats.operationSuccesses()).isEqualTo(1);
            assertThat(stats.releases()).isEqualTo(1);
        }
    }

    // -------------------------------------------------------------------------
    // executeWithFencedLock
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithFencedLockTest {

        @Test
        void tokenNotNull_operationExecutes_returnsValue() throws Exception {
            when(redissonClient.getFencedLock("fkey")).thenReturn(fencedLock);
            when(fencedLock.tryLockAndGetToken(10, 30, TimeUnit.SECONDS)).thenReturn(42L);
            when(fencedLock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithFencedLock("fkey",
                    token -> "result-" + token);

            assertThat(result).contains("result-42");
            verify(fencedLock).unlock();
        }

        @Test
        void tokenNull_timeout_returnsEmpty() throws Exception {
            when(redissonClient.getFencedLock("fkey")).thenReturn(fencedLock);
            when(fencedLock.tryLockAndGetToken(10, 30, TimeUnit.SECONDS)).thenReturn(null);
            when(fencedLock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithFencedLock("fkey", token -> "x");

            assertThat(result).isEmpty();
            verify(fencedLock, never()).unlock();
        }

        @Test
        void operationThrows_wrappedInRuntimeException() throws Exception {
            when(redissonClient.getFencedLock("fkey")).thenReturn(fencedLock);
            when(fencedLock.tryLockAndGetToken(10, 30, TimeUnit.SECONDS)).thenReturn(1L);
            when(fencedLock.isHeldByCurrentThread()).thenReturn(true);

            assertThatThrownBy(() ->
                    service.executeWithFencedLock("fkey", token -> {
                        throw new Exception("fenced-error");
                    })
            )
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("フェンシング操作失敗: key=fkey")
                    .hasCauseInstanceOf(Exception.class);

            verify(fencedLock).unlock();
        }

        @Test
        void operationThrows_metricsRecordFailure() throws Exception {
            when(redissonClient.getFencedLock("fkey")).thenReturn(fencedLock);
            when(fencedLock.tryLockAndGetToken(10, 30, TimeUnit.SECONDS)).thenReturn(1L);
            when(fencedLock.isHeldByCurrentThread()).thenReturn(true);

            try {
                service.executeWithFencedLock("fkey", token -> {
                    throw new Exception("err");
                });
            } catch (RuntimeException ignored) {
            }

            DistributedLockService.LockMetrics.LockStats stats =
                    service.getMetrics().getAllStats().get("fkey");
            assertThat(stats.operationFailures()).isEqualTo(1);
        }

        @Test
        void unlockThrows_exceptionSwallowed() throws Exception {
            when(redissonClient.getFencedLock("fkey")).thenReturn(fencedLock);
            when(fencedLock.tryLockAndGetToken(10, 30, TimeUnit.SECONDS)).thenReturn(1L);
            when(fencedLock.isHeldByCurrentThread()).thenReturn(true);
            doThrow(new IllegalMonitorStateException("err")).when(fencedLock).unlock();

            assertThatNoException().isThrownBy(() ->
                    service.executeWithFencedLock("fkey", token -> "ok"));
        }

        @Test
        void timeoutMetricRecorded_whenTokenNull() throws Exception {
            when(redissonClient.getFencedLock("fkey")).thenReturn(fencedLock);
            when(fencedLock.tryLockAndGetToken(10, 30, TimeUnit.SECONDS)).thenReturn(null);
            when(fencedLock.isHeldByCurrentThread()).thenReturn(false);

            service.executeWithFencedLock("fkey", token -> "x");

            DistributedLockService.LockMetrics.LockStats stats =
                    service.getMetrics().getAllStats().get("fkey");
            assertThat(stats.timeouts()).isEqualTo(1);
        }
    }

    // -------------------------------------------------------------------------
    // executeWithReadLock
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithReadLockTest {

        @BeforeEach
        void setUpRwLock() {
            when(redissonClient.getReadWriteLock("rwkey")).thenReturn(rwLock);
            when(rwLock.readLock()).thenReturn(readLock);
        }

        @Test
        void readLockAcquired_operationExecutes_returnsValue() throws InterruptedException {
            when(readLock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(readLock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithReadLock("rwkey", () -> "data");

            assertThat(result).contains("data");
            verify(readLock).unlock();
        }

        @Test
        void readLockTimeout_returnsEmpty() throws InterruptedException {
            when(readLock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(false);
            when(readLock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithReadLock("rwkey", () -> "data");

            assertThat(result).isEmpty();
            verify(readLock, never()).unlock();
        }

        @Test
        void readLockInterrupted_restoresInterruptFlag_returnsEmpty() throws InterruptedException {
            when(readLock.tryLock(anyLong(), anyLong(), any(TimeUnit.class)))
                    .thenThrow(new InterruptedException());
            when(readLock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithReadLock("rwkey", () -> "data");

            assertThat(result).isEmpty();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            Thread.interrupted();
        }

        @Test
        void readLockNotHeldAfterOperation_unlockSkipped() throws InterruptedException {
            when(readLock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(readLock.isHeldByCurrentThread()).thenReturn(false);

            service.executeWithReadLock("rwkey", () -> "data");

            verify(readLock, never()).unlock();
        }
    }

    // -------------------------------------------------------------------------
    // executeWithWriteLock
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithWriteLockTest {

        @BeforeEach
        void setUpRwLock() {
            when(redissonClient.getReadWriteLock("rwkey")).thenReturn(rwLock);
            when(rwLock.writeLock()).thenReturn(writeLock);
        }

        @Test
        void writeLockAcquired_operationExecutes_returnsValue() throws InterruptedException {
            when(writeLock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(writeLock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithWriteLock("rwkey", () -> "written");

            assertThat(result).contains("written");
            verify(writeLock).unlock();
        }

        @Test
        void writeLockTimeout_returnsEmpty() throws InterruptedException {
            when(writeLock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(false);
            when(writeLock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithWriteLock("rwkey", () -> "written");

            assertThat(result).isEmpty();
            verify(writeLock, never()).unlock();
        }

        @Test
        void writeLockInterrupted_restoresInterruptFlag_returnsEmpty() throws InterruptedException {
            when(writeLock.tryLock(anyLong(), anyLong(), any(TimeUnit.class)))
                    .thenThrow(new InterruptedException());
            when(writeLock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithWriteLock("rwkey", () -> "written");

            assertThat(result).isEmpty();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            Thread.interrupted();
        }

        @Test
        void writeLockNotHeldAfterOperation_unlockSkipped() throws InterruptedException {
            when(writeLock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(writeLock.isHeldByCurrentThread()).thenReturn(false);

            service.executeWithWriteLock("rwkey", () -> "written");

            verify(writeLock, never()).unlock();
        }
    }

    // -------------------------------------------------------------------------
    // executeWithFairLock
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithFairLockTest {

        @Test
        void fairLockAcquired_operationExecutes_returnsValue() throws InterruptedException {
            when(redissonClient.getFairLock("flock")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithFairLock("flock", () -> "fair-result");

            assertThat(result).contains("fair-result");
            verify(lock).unlock();
        }

        @Test
        void fairLockTimeout_returnsEmpty() throws InterruptedException {
            when(redissonClient.getFairLock("flock")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(false);
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithFairLock("flock", () -> "x");

            assertThat(result).isEmpty();
        }

        @Test
        void fairLockInterrupted_restoresInterruptFlag_returnsEmpty() throws InterruptedException {
            when(redissonClient.getFairLock("flock")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class)))
                    .thenThrow(new InterruptedException());
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithFairLock("flock", () -> "x");

            assertThat(result).isEmpty();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            Thread.interrupted();
        }

        @Test
        void fairLockNotHeld_unlockSkipped() throws InterruptedException {
            when(redissonClient.getFairLock("flock")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            service.executeWithFairLock("flock", () -> "x");

            verify(lock, never()).unlock();
        }
    }

    // -------------------------------------------------------------------------
    // executeWithSpinLock
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithSpinLockTest {

        @Test
        void spinLockAcquired_usesWaitTimeOf5_returnsValue() throws InterruptedException {
            when(redissonClient.getSpinLock("slock")).thenReturn(lock);
            // waitTime must be 5 (not the default 10)
            when(lock.tryLock(5, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithSpinLock("slock", () -> "spin-result");

            assertThat(result).contains("spin-result");
            verify(lock).tryLock(5, 30, TimeUnit.SECONDS);
            verify(lock).unlock();
        }

        @Test
        void spinLockTimeout_returnsEmpty() throws InterruptedException {
            when(redissonClient.getSpinLock("slock")).thenReturn(lock);
            when(lock.tryLock(5, 30, TimeUnit.SECONDS)).thenReturn(false);
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithSpinLock("slock", () -> "x");

            assertThat(result).isEmpty();
        }

        @Test
        void spinLockInterrupted_restoresInterruptFlag_returnsEmpty() throws InterruptedException {
            when(redissonClient.getSpinLock("slock")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class)))
                    .thenThrow(new InterruptedException());
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            Optional<String> result = service.executeWithSpinLock("slock", () -> "x");

            assertThat(result).isEmpty();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            Thread.interrupted();
        }

        @Test
        void spinLockNotHeld_unlockSkipped() throws InterruptedException {
            when(redissonClient.getSpinLock("slock")).thenReturn(lock);
            when(lock.tryLock(5, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            service.executeWithSpinLock("slock", () -> "x");

            verify(lock, never()).unlock();
        }
    }

    // -------------------------------------------------------------------------
    // executeWithRetry
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithRetryTest {

        @Test
        void firstAttemptSucceeds_returnsValue() throws InterruptedException {
            when(redissonClient.getLock("rkey")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithRetry("rkey", () -> "ok");

            assertThat(result).contains("ok");
            // Only one tryLock call needed
            verify(lock, times(1)).tryLock(anyLong(), anyLong(), any(TimeUnit.class));
        }

        @Test
        void lockTimeoutOnFirstSucceedsOnSecond_returnsValue() throws InterruptedException {
            when(redissonClient.getLock("rkey")).thenReturn(lock);
            // First attempt: lock not acquired; second attempt: acquired
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class)))
                    .thenReturn(false)
                    .thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(false, true);

            Optional<String> result = service.executeWithRetry("rkey", () -> "second-try");

            assertThat(result).contains("second-try");
            verify(lock, times(2)).tryLock(anyLong(), anyLong(), any(TimeUnit.class));
        }

        @Test
        void allThreeAttemptsLockTimeout_returnsEmpty() throws InterruptedException {
            when(redissonClient.getLock("rkey")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(false);
            // isHeldByCurrentThread is NOT called when tryLock returns false in tryExecuteWithLockOnce

            Optional<String> result = service.executeWithRetry("rkey", () -> "x");

            assertThat(result).isEmpty();
            verify(lock, times(3)).tryLock(anyLong(), anyLong(), any(TimeUnit.class));
        }

        @Test
        void operationThrowsOnFirstAttempt_retriesAndSucceeds() throws InterruptedException {
            AtomicInteger callCount = new AtomicInteger(0);
            when(redissonClient.getLock("rkey")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithRetry("rkey", () -> {
                if (callCount.incrementAndGet() < 2) {
                    throw new RuntimeException("transient");
                }
                return "recovered";
            });

            assertThat(result).contains("recovered");
        }

        @Test
        void operationThrowsAllAttempts_returnsEmpty() throws InterruptedException {
            when(redissonClient.getLock("rkey")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithRetry("rkey", () -> {
                throw new RuntimeException("always-fail");
            });

            assertThat(result).isEmpty();
            verify(lock, times(3)).tryLock(anyLong(), anyLong(), any(TimeUnit.class));
        }

        @Test
        void interruptedDuringSleep_stopsRetry_returnsEmpty() throws InterruptedException {
            // First call returns false so the code goes to sleep before retry
            when(redissonClient.getLock("rkey")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(false);
            // NOTE: isHeldByCurrentThread is NOT called when tryLock returns false,
            // so we must NOT stub it here (strict Mockito would raise UnnecessaryStubbingException).

            // Interrupt the current thread just before executeWithRetry so the sleep
            // inside the retry loop sees the interrupt.
            Thread.currentThread().interrupt();

            Optional<String> result = service.executeWithRetry("rkey", () -> "x");

            assertThat(result).isEmpty();
            // The interrupt flag should have been restored by the service
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            Thread.interrupted();
        }

        @Test
        void lockAcquiredSuccessful_operationReturnsNull_returnsEmptyWithoutRetry()
                throws InterruptedException {
            // When the operation returns null (Optional.empty wrapper), it should NOT retry
            when(redissonClient.getLock("rkey")).thenReturn(lock);
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithRetry("rkey", () -> null);

            assertThat(result).isEmpty();
            // Only one attempt because lock was acquired (no retry needed)
            verify(lock, times(1)).tryLock(anyLong(), anyLong(), any(TimeUnit.class));
        }
    }

    // -------------------------------------------------------------------------
    // executeWithShardedLock
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithShardedLockTest {

        @Test
        void delegatesToExecuteWithLock_withShardKey() throws InterruptedException {
            // Compute expected shard for "user123"
            int expectedShard = Math.floorMod("user123".hashCode(), 16);
            String expectedLockKey = "sharded_lock_" + expectedShard;

            when(redissonClient.getLock(expectedLockKey)).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            Optional<String> result = service.executeWithShardedLock("user123", () -> "sharded");

            assertThat(result).contains("sharded");
            verify(redissonClient).getLock(expectedLockKey);
        }

        @Test
        void sameResourceAlwaysMapsToSameShard() throws InterruptedException {
            int shard1 = Math.floorMod("resource-abc".hashCode(), 16);
            int shard2 = Math.floorMod("resource-abc".hashCode(), 16);
            assertThat(shard1).isEqualTo(shard2);

            String lockKey = "sharded_lock_" + shard1;
            when(redissonClient.getLock(lockKey)).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            service.executeWithShardedLock("resource-abc", () -> "x");
            service.executeWithShardedLock("resource-abc", () -> "y");

            // Same shard key used both times
            verify(redissonClient, times(2)).getLock(lockKey);
        }

        @Test
        void shardIndexInRange_0to15() {
            // Verify that the shard computation always falls in [0, 15]
            String[] resourceIds = {"a", "b", "user123", "order:99", "", "very-long-key-12345"};
            for (String resourceId : resourceIds) {
                int shard = Math.floorMod(resourceId.hashCode(), 16);
                assertThat(shard).isBetween(0, 15);
            }
        }
    }

    // -------------------------------------------------------------------------
    // executeWithLockAsync
    // -------------------------------------------------------------------------

    @Nested
    class ExecuteWithLockAsyncTest {

        @Test
        void operationSucceeds_futureCompletesWithValue() throws Exception {
            when(redissonClient.getLock("akey")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);

            CompletableFuture<Optional<String>> future =
                    service.executeWithLockAsync("akey", () -> "async-result");

            Optional<String> result = future.get(5, TimeUnit.SECONDS);
            assertThat(result).contains("async-result");
        }

        @Test
        void lockNotAcquired_futureCompletesWithEmpty() throws Exception {
            when(redissonClient.getLock("akey")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(false);
            when(lock.isHeldByCurrentThread()).thenReturn(false);

            CompletableFuture<Optional<String>> future =
                    service.executeWithLockAsync("akey", () -> "x");

            Optional<String> result = future.get(5, TimeUnit.SECONDS);
            assertThat(result).isEmpty();
        }

        @Test
        void operationThrows_exceptionallyReturnsEmpty() throws Exception {
            // Use a dedicated single-thread executor that submits the task synchronously
            // for this test, so the exception propagates through supplyAsync and is
            // caught by the .exceptionally handler.
            ExecutorService throwingExecutor = Executors.newSingleThreadExecutor();
            DistributedLockService svc = new DistributedLockService(redissonClient, throwingExecutor);

            when(redissonClient.getLock("ex-key")).thenReturn(lock);
            when(lock.tryLock(10, 30, TimeUnit.SECONDS)).thenReturn(true);
            // Simulate the operation throwing; isHeldByCurrentThread throws so the
            // finally block itself raises an exception that escapes executeWithLock,
            // which means the CompletableFuture completes exceptionally.
            when(lock.isHeldByCurrentThread()).thenThrow(new RuntimeException("async-boom"));

            CompletableFuture<Optional<String>> future =
                    svc.executeWithLockAsync("ex-key", () -> "value");

            // .exceptionally should catch the throwable and return Optional.empty()
            Optional<String> result = future.get(5, TimeUnit.SECONDS);
            assertThat(result).isEmpty();

            throwingExecutor.shutdownNow();
        }

        @Test
        void futureIsNotNull() {
            when(redissonClient.getLock("akey")).thenReturn(lock);
            // No further stubbing needed; just verify non-null return
            CompletableFuture<Optional<String>> future =
                    service.executeWithLockAsync("akey", () -> "val");
            assertThat(future).isNotNull();
        }
    }

    // -------------------------------------------------------------------------
    // isLocked
    // -------------------------------------------------------------------------

    @Nested
    class IsLockedTest {

        @Test
        void lockIsLocked_returnsTrue() {
            when(redissonClient.getLock("lk")).thenReturn(lock);
            when(lock.isLocked()).thenReturn(true);

            assertThat(service.isLocked("lk")).isTrue();
        }

        @Test
        void lockIsNotLocked_returnsFalse() {
            when(redissonClient.getLock("lk")).thenReturn(lock);
            when(lock.isLocked()).thenReturn(false);

            assertThat(service.isLocked("lk")).isFalse();
        }
    }

    // -------------------------------------------------------------------------
    // forceUnlock
    // -------------------------------------------------------------------------

    @Nested
    class ForceUnlockTest {

        @Test
        void lockIsLocked_forceUnlockCalled_returnsTrue() {
            when(redissonClient.getLock("fk")).thenReturn(lock);
            when(lock.isLocked()).thenReturn(true);

            boolean result = service.forceUnlock("fk");

            assertThat(result).isTrue();
            verify(lock).forceUnlock();
        }

        @Test
        void lockIsNotLocked_forceUnlockNotCalled_returnsFalse() {
            when(redissonClient.getLock("fk")).thenReturn(lock);
            when(lock.isLocked()).thenReturn(false);

            boolean result = service.forceUnlock("fk");

            assertThat(result).isFalse();
            verify(lock, never()).forceUnlock();
        }
    }

    // -------------------------------------------------------------------------
    // shutdown
    // -------------------------------------------------------------------------

    @Nested
    class ShutdownTest {

        @Test
        void shutdown_normalTermination_executorIsShutdown() throws InterruptedException {
            ExecutorService testExecutor = Executors.newSingleThreadExecutor();
            DistributedLockService svc = new DistributedLockService(redissonClient, testExecutor);

            svc.shutdown();

            assertThat(testExecutor.isShutdown()).isTrue();
        }

        @Test
        void shutdown_awaitTerminationTimesOut_callsShutdownNow() throws InterruptedException {
            ExecutorService mockExecutor = mock(ExecutorService.class);
            // awaitTermination returns false → simulates timeout
            when(mockExecutor.awaitTermination(5, TimeUnit.SECONDS)).thenReturn(false);

            DistributedLockService svc = new DistributedLockService(redissonClient, mockExecutor);
            svc.shutdown();

            verify(mockExecutor).shutdown();
            verify(mockExecutor).awaitTermination(5, TimeUnit.SECONDS);
            verify(mockExecutor).shutdownNow();
        }

        @Test
        void shutdown_awaitTerminationInterrupted_restoresInterruptAndCallsShutdownNow()
                throws InterruptedException {
            ExecutorService mockExecutor = mock(ExecutorService.class);
            when(mockExecutor.awaitTermination(5, TimeUnit.SECONDS))
                    .thenThrow(new InterruptedException("interrupted"));

            DistributedLockService svc = new DistributedLockService(redissonClient, mockExecutor);
            svc.shutdown();

            verify(mockExecutor).shutdownNow();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            Thread.interrupted();
        }
    }

    // -------------------------------------------------------------------------
    // LockMetrics inner class
    // -------------------------------------------------------------------------

    @Nested
    class LockMetricsTest {

        private DistributedLockService.LockMetrics metrics;

        @BeforeEach
        void setUpMetrics() {
            metrics = new DistributedLockService.LockMetrics();
        }

        @Test
        void recordLockAttempt_incrementsAttempts() {
            metrics.recordLockAttempt("k");
            metrics.recordLockAttempt("k");

            assertThat(metrics.getAllStats().get("k").attempts()).isEqualTo(2);
        }

        @Test
        void recordLockAcquired_incrementsAcquisitions() {
            metrics.recordLockAcquired("k");

            assertThat(metrics.getAllStats().get("k").acquisitions()).isEqualTo(1);
        }

        @Test
        void recordLockTimeout_incrementsTimeouts() {
            metrics.recordLockTimeout("k");

            assertThat(metrics.getAllStats().get("k").timeouts()).isEqualTo(1);
        }

        @Test
        void recordLockReleased_incrementsReleases() {
            metrics.recordLockReleased("k");

            assertThat(metrics.getAllStats().get("k").releases()).isEqualTo(1);
        }

        @Test
        void recordOperationSuccess_incrementsSuccesses() {
            metrics.recordOperationSuccess("k");

            assertThat(metrics.getAllStats().get("k").operationSuccesses()).isEqualTo(1);
        }

        @Test
        void recordOperationFailure_incrementsFailures() {
            metrics.recordOperationFailure("k");

            assertThat(metrics.getAllStats().get("k").operationFailures()).isEqualTo(1);
        }

        @Test
        void getAllStats_returnsSnapshotOfAllKeys() {
            metrics.recordLockAttempt("k1");
            metrics.recordLockAttempt("k2");

            Map<String, DistributedLockService.LockMetrics.LockStats> all = metrics.getAllStats();

            assertThat(all).containsKeys("k1", "k2");
        }

        @Test
        void reset_clearsAllStats() {
            metrics.recordLockAttempt("k1");
            metrics.recordLockAcquired("k1");

            metrics.reset();

            assertThat(metrics.getAllStats()).isEmpty();
        }

        @Test
        void getTotalStats_emptyMetrics_returnsAllZeros() {
            DistributedLockService.LockMetrics.LockStats total = metrics.getTotalStats();

            assertThat(total.attempts()).isEqualTo(0);
            assertThat(total.acquisitions()).isEqualTo(0);
            assertThat(total.timeouts()).isEqualTo(0);
            assertThat(total.releases()).isEqualTo(0);
            assertThat(total.operationSuccesses()).isEqualTo(0);
            assertThat(total.operationFailures()).isEqualTo(0);
        }

        @Test
        void getTotalStats_multipleKeys_aggregatesCorrectly() {
            // Key A: 2 attempts, 2 acquired, 0 timeouts, 2 released, 2 successes, 0 failures
            metrics.recordLockAttempt("a");
            metrics.recordLockAttempt("a");
            metrics.recordLockAcquired("a");
            metrics.recordLockAcquired("a");
            metrics.recordLockReleased("a");
            metrics.recordLockReleased("a");
            metrics.recordOperationSuccess("a");
            metrics.recordOperationSuccess("a");

            // Key B: 1 attempt, 0 acquired, 1 timeout, 0 released, 0 successes, 1 failure
            metrics.recordLockAttempt("b");
            metrics.recordLockTimeout("b");
            metrics.recordOperationFailure("b");

            DistributedLockService.LockMetrics.LockStats total = metrics.getTotalStats();

            assertThat(total.attempts()).isEqualTo(3);
            assertThat(total.acquisitions()).isEqualTo(2);
            assertThat(total.timeouts()).isEqualTo(1);
            assertThat(total.releases()).isEqualTo(2);
            assertThat(total.operationSuccesses()).isEqualTo(2);
            assertThat(total.operationFailures()).isEqualTo(1);
        }

        @Test
        void firstRecordForNewKey_createsEntryWithCorrectField() {
            // When a key is first seen via recordLockAcquired (not attempt), it should still work
            metrics.recordLockAcquired("newkey");

            DistributedLockService.LockMetrics.LockStats stats = metrics.getAllStats().get("newkey");
            assertThat(stats.acquisitions()).isEqualTo(1);
            assertThat(stats.attempts()).isEqualTo(0);
        }
    }

    // -------------------------------------------------------------------------
    // LockStats record
    // -------------------------------------------------------------------------

    @Nested
    class LockStatsTest {

        @Test
        void getSuccessRate_withAttempts_calculatesCorrectly() {
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(4, 3, 1, 3, 3, 0);

            assertThat(stats.getSuccessRate()).isEqualTo(3.0 / 4.0);
        }

        @Test
        void getSuccessRate_zeroAttempts_returnsZero() {
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(0, 0, 0, 0, 0, 0);

            assertThat(stats.getSuccessRate()).isEqualTo(0.0);
        }

        @Test
        void getTimeoutRate_withAttempts_calculatesCorrectly() {
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(10, 7, 3, 7, 7, 0);

            assertThat(stats.getTimeoutRate()).isEqualTo(3.0 / 10.0);
        }

        @Test
        void getTimeoutRate_zeroAttempts_returnsZero() {
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(0, 0, 0, 0, 0, 0);

            assertThat(stats.getTimeoutRate()).isEqualTo(0.0);
        }

        @Test
        void getOperationSuccessRate_withOperations_calculatesCorrectly() {
            // 8 successes, 2 failures → 80%
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(10, 10, 0, 10, 8, 2);

            assertThat(stats.getOperationSuccessRate()).isEqualTo(8.0 / 10.0);
        }

        @Test
        void getOperationSuccessRate_zeroOperations_returnsZero() {
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(5, 0, 5, 0, 0, 0);

            assertThat(stats.getOperationSuccessRate()).isEqualTo(0.0);
        }

        @Test
        void getOperationSuccessRate_allSuccesses_returnsOne() {
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(5, 5, 0, 5, 5, 0);

            assertThat(stats.getOperationSuccessRate()).isEqualTo(1.0);
        }

        @Test
        void getOperationSuccessRate_allFailures_returnsZero() {
            DistributedLockService.LockMetrics.LockStats stats =
                    new DistributedLockService.LockMetrics.LockStats(5, 5, 0, 5, 0, 5);

            assertThat(stats.getOperationSuccessRate()).isEqualTo(0.0);
        }
    }

    // -------------------------------------------------------------------------
    // getMetrics()
    // -------------------------------------------------------------------------

    @Test
    void getMetrics_returnsNonNull() {
        assertThat(service.getMetrics()).isNotNull();
    }

    @Test
    void getMetrics_returnsSameInstance() {
        assertThat(service.getMetrics()).isSameAs(service.getMetrics());
    }
}
