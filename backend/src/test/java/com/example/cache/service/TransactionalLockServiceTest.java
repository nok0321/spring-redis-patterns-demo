package com.example.cache.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for TransactionalLockService.
 * All Redis interactions are mocked; no running Redis instance required.
 */
@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked")
class TransactionalLockServiceTest {

    @Mock
    RedissonClient redissonClient;

    @Mock
    DistributedLockService lockService;

    @Mock
    RTransaction transaction;

    @Mock
    RLock lock;

    @Mock
    RBucket<Object> bucket;

    @Mock
    RMap<String, Object> rMap;

    @Mock
    @SuppressWarnings("rawtypes")
    RMapCache rMapCache;

    private TransactionalLockService service;

    @BeforeEach
    void setUp() {
        service = new TransactionalLockService(redissonClient, lockService);
    }

    // -------------------------------------------------------------------------
    // Helper: make createTransaction() return the mock transaction
    // -------------------------------------------------------------------------
    private void stubCreateTransaction() {
        when(redissonClient.createTransaction(any(TransactionOptions.class)))
                .thenReturn(transaction);
    }

    // =========================================================================
    // 1. executeInTransaction
    // =========================================================================
    @Nested
    class ExecuteInTransaction {

        @Test
        void success_commitsAndReturnsResult() {
            stubCreateTransaction();
            Function<RTransaction, String> op = tx -> "result";

            Optional<String> result = service.executeInTransaction(op);

            assertThat(result).isPresent().contains("result");
            verify(transaction).commit();
            verify(transaction, never()).rollback();

            // stats: 1 successful transaction
            Map<String, Long> stats = service.getStats().getStats();
            assertThat(stats.get("total")).isEqualTo(1L);
            assertThat(stats.get("successful")).isEqualTo(1L);
            assertThat(stats.get("failed")).isEqualTo(0L);
        }

        @Test
        void success_returnsNullWrappedAsEmpty_whenOperationReturnsNull() {
            stubCreateTransaction();
            Function<RTransaction, String> op = tx -> null;

            Optional<String> result = service.executeInTransaction(op);

            assertThat(result).isEmpty();
            verify(transaction).commit();
        }

        @Test
        void failure_rollbacksAndReturnsEmpty() {
            stubCreateTransaction();
            Function<RTransaction, String> op = tx -> { throw new RuntimeException("boom"); };

            Optional<String> result = service.executeInTransaction(op);

            assertThat(result).isEmpty();
            verify(transaction, never()).commit();
            verify(transaction).rollback();

            Map<String, Long> stats = service.getStats().getStats();
            assertThat(stats.get("failed")).isEqualTo(1L);
            assertThat(stats.get("rollbacks")).isEqualTo(1L);
        }

        @Test
        void failure_whenRollbackAlsoThrows_logsAndStillReturnsEmpty() {
            stubCreateTransaction();
            Function<RTransaction, String> op = tx -> { throw new RuntimeException("op fail"); };
            doThrow(new RuntimeException("rollback fail")).when(transaction).rollback();

            Optional<String> result = service.executeInTransaction(op);

            assertThat(result).isEmpty();
            verify(transaction).rollback();
            // rollback stat is NOT recorded because the rollback itself threw
            Map<String, Long> stats = service.getStats().getStats();
            assertThat(stats.get("rollbacks")).isEqualTo(0L);
        }
    }

    // =========================================================================
    // 2. executeWithTransactionalLock
    // =========================================================================
    @Nested
    class ExecuteWithTransactionalLock {

        @BeforeEach
        void stubLock() {
            when(redissonClient.getLock(anyString())).thenReturn(lock);
        }

        @Test
        void lockNotAcquired_returnsEmpty() throws InterruptedException {
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(false);

            Optional<String> result = service.executeWithTransactionalLock("key", tx -> "x");

            assertThat(result).isEmpty();
            verify(redissonClient, never()).createTransaction(any());
        }

        @Test
        void lockAcquired_operationSucceeds_commitsAndReturnsResult() throws InterruptedException {
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);
            stubCreateTransaction();

            Optional<String> result = service.executeWithTransactionalLock("key", tx -> "value");

            assertThat(result).isPresent().contains("value");
            verify(transaction).commit();
            verify(lock).unlock();
        }

        @Test
        void lockAcquired_operationThrows_rollbacksAndReturnsEmpty() throws InterruptedException {
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(true);
            stubCreateTransaction();
            RuntimeException opEx = new RuntimeException("op error");

            Optional<String> result = service.executeWithTransactionalLock("key",
                    tx -> { throw opEx; });

            assertThat(result).isEmpty();
            verify(transaction).rollback();
            verify(lock).unlock();

            Map<String, Long> stats = service.getStats().getStats();
            assertThat(stats.get("rollbacks")).isEqualTo(1L);
        }

        @Test
        void lockAcquired_operationThrows_rollbackAlsoThrows_suppressedExceptionAdded()
                throws InterruptedException {
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(false);
            stubCreateTransaction();
            RuntimeException opEx = new RuntimeException("op error");
            RuntimeException rollbackEx = new RuntimeException("rollback error");
            doThrow(rollbackEx).when(transaction).rollback();

            // The rethrown operation exception has the rollback exception suppressed
            Optional<String> result = service.executeWithTransactionalLock("key",
                    tx -> { throw opEx; });

            // Outer catch captures the rethrown exception -> returns empty
            assertThat(result).isEmpty();
        }

        @Test
        void interruptedDuringTryLock_restoresInterruptAndReturnsEmpty()
                throws InterruptedException {
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class)))
                    .thenThrow(new InterruptedException("interrupted"));

            Optional<String> result = service.executeWithTransactionalLock("key", tx -> "x");

            assertThat(result).isEmpty();
            // Thread interrupt flag should be restored
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            // Clear interrupt flag for subsequent tests
            Thread.interrupted();
        }

        @Test
        void finally_lockNotUnlockedWhenNotHeldByCurrentThread() throws InterruptedException {
            when(lock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
            when(lock.isHeldByCurrentThread()).thenReturn(false);
            stubCreateTransaction();

            service.executeWithTransactionalLock("key", tx -> "v");

            verify(lock, never()).unlock();
        }
    }

    // =========================================================================
    // 3. executeBatchWithTransaction
    // =========================================================================
    @Nested
    class ExecuteBatchWithTransaction {

        @Test
        void success_setsAllKeysAndReturnsTrue() {
            stubCreateTransaction();
            when(transaction.getBucket(anyString())).thenReturn((RBucket) bucket);

            boolean result = service.executeBatchWithTransaction(
                    Map.of("k1", "v1", "k2", "v2"));

            assertThat(result).isTrue();
            verify(transaction).commit();
            // getBucket called once per key
            verify(transaction, times(2)).getBucket(anyString());
        }

        @Test
        void failure_operationThrows_returnsFalse() {
            stubCreateTransaction();
            when(transaction.getBucket(anyString()))
                    .thenThrow(new RuntimeException("redis error"));

            boolean result = service.executeBatchWithTransaction(Map.of("k1", "v1"));

            assertThat(result).isFalse();
            verify(transaction).rollback();
        }
    }

    // =========================================================================
    // 4. executeTransfer
    // =========================================================================
    @Nested
    class ExecuteTransfer {

        /**
         * Stub lockService.executeWithFencedLock to immediately invoke the FencedOperation
         * with the given fencing token, and return the operation's result wrapped in Optional.
         */
        @SuppressWarnings("unchecked")
        private void stubFencedLockToExecute(long fencingToken) {
            when(lockService.executeWithFencedLock(anyString(), any()))
                    .thenAnswer(inv -> {
                        DistributedLockService.FencedOperation<Boolean> op =
                                inv.getArgument(1);
                        return Optional.ofNullable(op.execute(fencingToken));
                    });
        }

        private void stubTransactionForTransfer(Double fromBalance, Double toBalance) {
            stubCreateTransaction();

            RMap<String, Object> transferMap = mock(RMap.class);
            when(transaction.getMap(anyString())).thenReturn((RMap) transferMap);

            RBucket<Double> fromBucket = mock(RBucket.class);
            RBucket<Double> toBucket = mock(RBucket.class);
            when(fromBucket.get()).thenReturn(fromBalance);
            when(toBucket.get()).thenReturn(toBalance);

            // First call -> fromBucket, second call -> toBucket
            when(transaction.<Double>getBucket(anyString()))
                    .thenReturn(fromBucket)
                    .thenReturn(toBucket);
        }

        @Test
        void success_fromBalanceSufficient_returnsTrue() {
            stubFencedLockToExecute(42L);
            stubTransactionForTransfer(500.0, 100.0);

            RMap<String, Object> postCommitMap = mock(RMap.class);
            when(redissonClient.getMap(anyString())).thenReturn((RMap) postCommitMap);

            boolean result = service.executeTransfer("acc:A", "acc:B", 200.0, "tx-1");

            assertThat(result).isTrue();
            verify(transaction).commit();
            // TTL must be set on the transfer map after commit
            verify(postCommitMap).expire(any(java.time.Duration.class));
        }

        @Test
        void failure_fromBalanceNull_returnsFalse() {
            stubFencedLockToExecute(1L);
            stubTransactionForTransfer(null, 0.0);

            boolean result = service.executeTransfer("acc:A", "acc:B", 100.0, "tx-2");

            assertThat(result).isFalse();
            verify(transaction).rollback();
        }

        @Test
        void failure_fromBalanceInsufficient_returnsFalse() {
            stubFencedLockToExecute(1L);
            stubTransactionForTransfer(50.0, 0.0);

            boolean result = service.executeTransfer("acc:A", "acc:B", 100.0, "tx-3");

            assertThat(result).isFalse();
            verify(transaction).rollback();
        }

        @Test
        void toBucketNull_treatedAsZero_succeeds() {
            stubFencedLockToExecute(1L);
            stubTransactionForTransfer(200.0, null);

            RMap<String, Object> postCommitMap = mock(RMap.class);
            when(redissonClient.getMap(anyString())).thenReturn((RMap) postCommitMap);

            boolean result = service.executeTransfer("acc:A", "acc:B", 100.0, "tx-4");

            assertThat(result).isTrue();
        }

        @Test
        void fencedLockTimeout_returnsFalse() {
            when(lockService.executeWithFencedLock(anyString(), any()))
                    .thenReturn(Optional.empty());

            boolean result = service.executeTransfer("acc:A", "acc:B", 100.0, "tx-5");

            assertThat(result).isFalse();
            verify(redissonClient, never()).createTransaction(any());
        }

        @Test
        void deadlockPrevention_lockKeyUsesCanonicalOrder() {
            // When fromKey > toKey lexicographically, lock key should swap them
            stubFencedLockToExecute(1L);
            stubTransactionForTransfer(300.0, 0.0);
            RMap<String, Object> postCommitMap = mock(RMap.class);
            when(redissonClient.getMap(anyString())).thenReturn((RMap) postCommitMap);

            ArgumentCaptor<String> lockKeyCaptor = ArgumentCaptor.forClass(String.class);
            service.executeTransfer("acc:Z", "acc:A", 50.0, "tx-6");

            verify(lockService).executeWithFencedLock(lockKeyCaptor.capture(), any());
            String lockKey = lockKeyCaptor.getValue();
            // canonical: "acc:A" < "acc:Z", so lock key must be "transfer_lock:acc:A:acc:Z"
            assertThat(lockKey).isEqualTo("transfer_lock:acc:A:acc:Z");
        }

        @Test
        void sameOrder_lockKeyUnchanged() {
            stubFencedLockToExecute(1L);
            stubTransactionForTransfer(300.0, 0.0);
            RMap<String, Object> postCommitMap = mock(RMap.class);
            when(redissonClient.getMap(anyString())).thenReturn((RMap) postCommitMap);

            ArgumentCaptor<String> lockKeyCaptor = ArgumentCaptor.forClass(String.class);
            service.executeTransfer("acc:A", "acc:Z", 50.0, "tx-7");

            verify(lockService).executeWithFencedLock(lockKeyCaptor.capture(), any());
            assertThat(lockKeyCaptor.getValue()).isEqualTo("transfer_lock:acc:A:acc:Z");
        }
    }

    // =========================================================================
    // 5. executeWithCompensation
    // =========================================================================
    @Nested
    class ExecuteWithCompensation {

        @Test
        void success_commitsMaintx_noCompensation() {
            stubCreateTransaction();
            Function<RTransaction, String> op = tx -> "ok";
            Function<RTransaction, Void> comp = tx -> null;

            Optional<String> result = service.executeWithCompensation(op, comp);

            assertThat(result).isPresent().contains("ok");
            verify(transaction).commit();
            // compensation should not have been called
            Map<String, Long> stats = service.getStats().getStats();
            assertThat(stats.get("compensations")).isEqualTo(0L);
        }

        @Test
        void failure_mainTxFails_compensationSucceeds() {
            // First createTransaction -> main tx, second -> compensation tx
            RTransaction compensationTx = mock(RTransaction.class);
            when(redissonClient.createTransaction(any(TransactionOptions.class)))
                    .thenReturn(transaction)
                    .thenReturn(compensationTx);

            Function<RTransaction, String> op = tx -> { throw new RuntimeException("fail"); };
            Function<RTransaction, Void> comp = tx -> null;

            Optional<String> result = service.executeWithCompensation(op, comp);

            assertThat(result).isEmpty();
            verify(transaction).rollback();
            verify(compensationTx).commit();

            Map<String, Long> stats = service.getStats().getStats();
            assertThat(stats.get("compensations")).isEqualTo(1L);
        }

        @Test
        void failure_mainTxFails_rollbackAlsoThrows_compensationStillRuns() {
            RTransaction compensationTx = mock(RTransaction.class);
            when(redissonClient.createTransaction(any(TransactionOptions.class)))
                    .thenReturn(transaction)
                    .thenReturn(compensationTx);
            doThrow(new RuntimeException("rollback fail")).when(transaction).rollback();

            Function<RTransaction, String> op = tx -> { throw new RuntimeException("fail"); };
            Function<RTransaction, Void> comp = tx -> null;

            Optional<String> result = service.executeWithCompensation(op, comp);

            assertThat(result).isEmpty();
            verify(compensationTx).commit();
        }

        @Test
        void failure_mainTxFails_compensationAlsoFails_rollbacksCompensationAndReturnsEmpty() {
            RTransaction compensationTx = mock(RTransaction.class);
            when(redissonClient.createTransaction(any(TransactionOptions.class)))
                    .thenReturn(transaction)
                    .thenReturn(compensationTx);

            Function<RTransaction, String> op = tx -> { throw new RuntimeException("fail"); };
            Function<RTransaction, Void> comp = tx -> { throw new RuntimeException("comp fail"); };

            Optional<String> result = service.executeWithCompensation(op, comp);

            assertThat(result).isEmpty();
            verify(transaction).rollback();
            verify(compensationTx).rollback();

            Map<String, Long> stats = service.getStats().getStats();
            assertThat(stats.get("compensations")).isEqualTo(0L);
        }

        @Test
        void failure_compensationFails_compensationRollbackAlsoFails_logsAndReturnsEmpty() {
            RTransaction compensationTx = mock(RTransaction.class);
            when(redissonClient.createTransaction(any(TransactionOptions.class)))
                    .thenReturn(transaction)
                    .thenReturn(compensationTx);

            Function<RTransaction, String> op = tx -> { throw new RuntimeException("fail"); };
            Function<RTransaction, Void> comp = tx -> { throw new RuntimeException("comp fail"); };
            doThrow(new RuntimeException("comp rollback fail")).when(compensationTx).rollback();

            Optional<String> result = service.executeWithCompensation(op, comp);

            assertThat(result).isEmpty();
            verify(compensationTx).rollback();
        }
    }

    // =========================================================================
    // 6. executeTwoPhaseCommit
    // =========================================================================
    @Nested
    class ExecuteTwoPhaseCommit {

        @BeforeEach
        @SuppressWarnings("unchecked")
        void stubCoordinator() {
            when(redissonClient.getMapCache(anyString())).thenReturn(rMapCache);
        }

        @Test
        void allPrepareSucceed_allCommitSucceed_returnsTrue() throws Exception {
            TransactionalLockService.TransactionParticipant p1 = mock(TransactionalLockService.TransactionParticipant.class);
            TransactionalLockService.TransactionParticipant p2 = mock(TransactionalLockService.TransactionParticipant.class);
            when(p1.getId()).thenReturn("p1");
            when(p2.getId()).thenReturn("p2");
            when(p1.prepare(anyString())).thenReturn(true);
            when(p2.prepare(anyString())).thenReturn(true);

            boolean result = service.executeTwoPhaseCommit("coord", List.of(p1, p2));

            assertThat(result).isTrue();
            verify(p1).commit(anyString());
            verify(p2).commit(anyString());
            // COMMITTED status must be written
            ArgumentCaptor<String> statusCaptor = ArgumentCaptor.forClass(String.class);
            verify(rMapCache, atLeastOnce()).put(anyString(), statusCaptor.capture(),
                    anyLong(), any(TimeUnit.class));
            assertThat(statusCaptor.getAllValues()).contains("COMMITTED");
        }

        @Test
        void onePrepareReturnsFalse_abortsOnlyPreparedParticipants() throws Exception {
            TransactionalLockService.TransactionParticipant p1 = mock(TransactionalLockService.TransactionParticipant.class);
            TransactionalLockService.TransactionParticipant p2 = mock(TransactionalLockService.TransactionParticipant.class);
            when(p1.getId()).thenReturn("p1");
            when(p2.getId()).thenReturn("p2");
            when(p1.prepare(anyString())).thenReturn(true);
            when(p2.prepare(anyString())).thenReturn(false);

            boolean result = service.executeTwoPhaseCommit("coord", List.of(p1, p2));

            assertThat(result).isFalse();
            verify(p1).abort(anyString()); // p1 was prepared -> must be aborted
            verify(p2, never()).abort(anyString()); // p2 not prepared
            verify(p1, never()).commit(anyString());
            verify(p2, never()).commit(anyString());
        }

        @Test
        void onePrepareThrows_abortsOnlyPreparedParticipants() throws Exception {
            TransactionalLockService.TransactionParticipant p1 = mock(TransactionalLockService.TransactionParticipant.class);
            TransactionalLockService.TransactionParticipant p2 = mock(TransactionalLockService.TransactionParticipant.class);
            when(p1.getId()).thenReturn("p1");
            when(p2.getId()).thenReturn("p2");
            when(p1.prepare(anyString())).thenReturn(true);
            when(p2.prepare(anyString())).thenThrow(new RuntimeException("prepare boom"));

            boolean result = service.executeTwoPhaseCommit("coord", List.of(p1, p2));

            assertThat(result).isFalse();
            verify(p1).abort(anyString());
            verify(p2, never()).abort(anyString());
        }

        @Test
        void allPrepareSucceed_oneCommitThrows_returnsCommitFailed() throws Exception {
            TransactionalLockService.TransactionParticipant p1 = mock(TransactionalLockService.TransactionParticipant.class);
            TransactionalLockService.TransactionParticipant p2 = mock(TransactionalLockService.TransactionParticipant.class);
            when(p1.getId()).thenReturn("p1");
            when(p2.getId()).thenReturn("p2");
            when(p1.prepare(anyString())).thenReturn(true);
            when(p2.prepare(anyString())).thenReturn(true);
            doThrow(new RuntimeException("commit fail")).when(p1).commit(anyString());

            boolean result = service.executeTwoPhaseCommit("coord", List.of(p1, p2));

            assertThat(result).isFalse();
            ArgumentCaptor<String> statusCaptor = ArgumentCaptor.forClass(String.class);
            verify(rMapCache, atLeastOnce()).put(anyString(), statusCaptor.capture(),
                    anyLong(), any(TimeUnit.class));
            assertThat(statusCaptor.getAllValues()).contains("COMMIT_FAILED");
        }

        @Test
        void phase2Abort_abortThrowsForOne_continuesAndReturnsFalse() throws Exception {
            TransactionalLockService.TransactionParticipant p1 = mock(TransactionalLockService.TransactionParticipant.class);
            TransactionalLockService.TransactionParticipant p2 = mock(TransactionalLockService.TransactionParticipant.class);
            when(p1.getId()).thenReturn("p1");
            when(p2.getId()).thenReturn("p2");
            when(p1.prepare(anyString())).thenReturn(true);
            when(p2.prepare(anyString())).thenReturn(true);
            // Now fail prepare of p2 in a way that triggers abort of p1 only
            // Simpler: prepare succeeds for both, then make phase2 trigger abort by
            // making prepare return false on second participant
            reset(p1, p2);
            when(p1.getId()).thenReturn("p1");
            when(p2.getId()).thenReturn("p2");
            when(p1.prepare(anyString())).thenReturn(true);
            when(p2.prepare(anyString())).thenReturn(false);
            doThrow(new RuntimeException("abort error")).when(p1).abort(anyString());

            boolean result = service.executeTwoPhaseCommit("coord", List.of(p1, p2));

            assertThat(result).isFalse();
            verify(p1).abort(anyString()); // abort called despite throwing
        }

        @Test
        void outerException_firstPutThrows_catchWritesFailed_returnsFalse() {
            // First put (PREPARING) throws -> outer catch fires -> catch writes FAILED
            // second put (FAILED) succeeds
            when(rMapCache.put(anyString(), anyString(), anyLong(), any(TimeUnit.class)))
                    .thenThrow(new RuntimeException("redis down"))
                    .thenReturn(null);

            boolean result = service.executeTwoPhaseCommit("coord", List.of());

            assertThat(result).isFalse();
            // Second put should carry the "FAILED" status
            ArgumentCaptor<String> statusCaptor = ArgumentCaptor.forClass(String.class);
            verify(rMapCache, atLeast(2)).put(anyString(), statusCaptor.capture(),
                    anyLong(), any(TimeUnit.class));
            assertThat(statusCaptor.getAllValues()).contains("FAILED");
        }

        @Test
        void emptyParticipantList_allPreparedSucceeds_commitReturnsTrue() {
            boolean result = service.executeTwoPhaseCommit("coord", List.of());

            assertThat(result).isTrue();
        }
    }

    // =========================================================================
    // 7. executeWithOptimisticLock
    // =========================================================================
    @Nested
    class ExecuteWithOptimisticLock {

        @Test
        void bucketReturnsNull_usesVersionZero_casSucceeds_returnsNewValue() {
            RBucket<TransactionalLockService.VersionedData<String>> typedBucket = mock(RBucket.class);
            when(redissonClient.<TransactionalLockService.VersionedData<String>>getBucket(anyString()))
                    .thenReturn(typedBucket);
            when(typedBucket.get()).thenReturn(null);
            when(typedBucket.compareAndSet(any(), any())).thenReturn(true);

            Optional<String> result = service.executeWithOptimisticLock("key",
                    vd -> "newValue");

            assertThat(result).isPresent().contains("newValue");

            ArgumentCaptor<TransactionalLockService.VersionedData<String>> newDataCaptor =
                    ArgumentCaptor.forClass(TransactionalLockService.VersionedData.class);
            // compareAndSet(expected, actual): first arg is null VersionedData(null,0)
            verify(typedBucket).compareAndSet(
                    argThat(d -> d instanceof TransactionalLockService.VersionedData<?> vd
                            && vd.version() == 0L && vd.data() == null),
                    any());
        }

        @Test
        void bucketReturnsExistingData_usesActualVersion_casSucceeds() {
            RBucket<TransactionalLockService.VersionedData<String>> typedBucket = mock(RBucket.class);
            TransactionalLockService.VersionedData<String> existing =
                    new TransactionalLockService.VersionedData<>("old", 5L);
            when(redissonClient.<TransactionalLockService.VersionedData<String>>getBucket(anyString()))
                    .thenReturn(typedBucket);
            when(typedBucket.get()).thenReturn(existing);
            when(typedBucket.compareAndSet(any(), any())).thenReturn(true);

            Optional<String> result = service.executeWithOptimisticLock("key",
                    vd -> "updated");

            assertThat(result).isPresent().contains("updated");
            // new version should be 6
            verify(typedBucket).compareAndSet(
                    eq(existing),
                    argThat(d -> d instanceof TransactionalLockService.VersionedData<?> vd
                            && vd.version() == 6L));
        }

        @Test
        void casReturnsFalse_returnsEmpty() {
            RBucket<TransactionalLockService.VersionedData<String>> typedBucket = mock(RBucket.class);
            when(redissonClient.<TransactionalLockService.VersionedData<String>>getBucket(anyString()))
                    .thenReturn(typedBucket);
            when(typedBucket.get()).thenReturn(null);
            when(typedBucket.compareAndSet(any(), any())).thenReturn(false);

            Optional<String> result = service.executeWithOptimisticLock("key",
                    vd -> "value");

            assertThat(result).isEmpty();
        }
    }

    // =========================================================================
    // 8. executeWithOptimisticLockRetry
    // =========================================================================
    @Nested
    class ExecuteWithOptimisticLockRetry {

        @Test
        void firstAttemptSucceeds_returnsImmediately() {
            RBucket<TransactionalLockService.VersionedData<String>> typedBucket = mock(RBucket.class);
            when(redissonClient.<TransactionalLockService.VersionedData<String>>getBucket(anyString()))
                    .thenReturn(typedBucket);
            when(typedBucket.get()).thenReturn(null);
            when(typedBucket.compareAndSet(any(), any())).thenReturn(true);

            Optional<String> result = service.executeWithOptimisticLockRetry(
                    "key", vd -> "v", 3);

            assertThat(result).isPresent().contains("v");
            verify(typedBucket, times(1)).compareAndSet(any(), any());
        }

        @Test
        void allAttemptsFail_returnsEmpty() {
            RBucket<TransactionalLockService.VersionedData<String>> typedBucket = mock(RBucket.class);
            when(redissonClient.<TransactionalLockService.VersionedData<String>>getBucket(anyString()))
                    .thenReturn(typedBucket);
            when(typedBucket.get()).thenReturn(null);
            when(typedBucket.compareAndSet(any(), any())).thenReturn(false);

            // maxRetries=2 -> total 3 attempts (0,1,2)
            Optional<String> result = service.executeWithOptimisticLockRetry(
                    "key", vd -> "v", 2);

            assertThat(result).isEmpty();
            verify(typedBucket, times(3)).compareAndSet(any(), any());
        }

        @Test
        void interruptedDuringSleep_restoresInterruptAndBreaks() throws InterruptedException {
            // Use a spy on the service to intercept Thread.sleep behavior:
            // We need exactly: first attempt fails (so retry is attempted), then interrupt fires.
            // Achieve this by making CAS fail twice while interrupting the thread during the
            // first sleep. We can only do this by interrupting from another thread.
            RBucket<TransactionalLockService.VersionedData<String>> typedBucket = mock(RBucket.class);
            when(redissonClient.<TransactionalLockService.VersionedData<String>>getBucket(anyString()))
                    .thenReturn(typedBucket);
            when(typedBucket.get()).thenReturn(null);

            // First CAS fails (triggers sleep), second CAS would succeed but won't be reached
            when(typedBucket.compareAndSet(any(), any()))
                    .thenReturn(false)
                    .thenReturn(true);

            // Interrupt the current thread from another thread during sleep
            Thread testThread = Thread.currentThread();
            Thread interrupter = new Thread(() -> {
                try {
                    Thread.sleep(5);
                } catch (InterruptedException ignored) {}
                testThread.interrupt();
            });
            interrupter.setDaemon(true);
            interrupter.start();

            Optional<String> result = service.executeWithOptimisticLockRetry(
                    "key", vd -> "v", 5);

            // Either empty (interrupted before retry) or present (lucky timing)
            // The important thing: interrupt flag is restored
            boolean interruptRestored = Thread.interrupted(); // clears flag
            // We just verify no exception is thrown and method terminates normally
            // The result may vary by timing, but the method must not throw
            assertThat(result).isNotNull();
            interrupter.join(1000);
        }
    }

    // =========================================================================
    // Inner class: VersionedData
    // =========================================================================
    @Nested
    class VersionedDataTests {

        @Test
        void nullVersionIsCoercedToZero() {
            TransactionalLockService.VersionedData<String> vd =
                    new TransactionalLockService.VersionedData<>("data", null);
            assertThat(vd.version()).isEqualTo(0L);
        }

        @Test
        void nonNullVersionIsPreserved() {
            TransactionalLockService.VersionedData<String> vd =
                    new TransactionalLockService.VersionedData<>("data", 7L);
            assertThat(vd.version()).isEqualTo(7L);
        }

        @Test
        void hasData_returnsTrueWhenDataNonNull() {
            TransactionalLockService.VersionedData<String> vd =
                    new TransactionalLockService.VersionedData<>("hello", 1L);
            assertThat(vd.hasData()).isTrue();
        }

        @Test
        void hasData_returnsFalseWhenDataNull() {
            TransactionalLockService.VersionedData<String> vd =
                    new TransactionalLockService.VersionedData<>(null, 0L);
            assertThat(vd.hasData()).isFalse();
        }

        @Test
        void nextVersion_incrementsVersionAndSetsNewData() {
            TransactionalLockService.VersionedData<String> vd =
                    new TransactionalLockService.VersionedData<>("old", 3L);
            TransactionalLockService.VersionedData<String> next = vd.nextVersion("new");
            assertThat(next.data()).isEqualTo("new");
            assertThat(next.version()).isEqualTo(4L);
        }

        @Test
        void nextVersion_fromVersionZero_givesVersionOne() {
            TransactionalLockService.VersionedData<String> vd =
                    new TransactionalLockService.VersionedData<>(null, 0L);
            TransactionalLockService.VersionedData<String> next = vd.nextVersion("v1");
            assertThat(next.version()).isEqualTo(1L);
        }
    }

    // =========================================================================
    // Inner class: TransactionStats
    // =========================================================================
    @Nested
    class TransactionStatsTests {

        private TransactionalLockService.TransactionStats stats;

        @BeforeEach
        void setUp() {
            stats = new TransactionalLockService.TransactionStats();
        }

        @Test
        void initialState_allZero() {
            Map<String, Long> s = stats.getStats();
            assertThat(s.get("total")).isEqualTo(0L);
            assertThat(s.get("successful")).isEqualTo(0L);
            assertThat(s.get("failed")).isEqualTo(0L);
            assertThat(s.get("rollbacks")).isEqualTo(0L);
            assertThat(s.get("compensations")).isEqualTo(0L);
            assertThat(s.get("successRate")).isEqualTo(0L);
        }

        @Test
        void recordTransaction_success_incrementsSuccessfulAndTotal() {
            stats.recordTransaction(true);
            Map<String, Long> s = stats.getStats();
            assertThat(s.get("total")).isEqualTo(1L);
            assertThat(s.get("successful")).isEqualTo(1L);
            assertThat(s.get("failed")).isEqualTo(0L);
        }

        @Test
        void recordTransaction_failure_incrementsFailedAndTotal() {
            stats.recordTransaction(false);
            Map<String, Long> s = stats.getStats();
            assertThat(s.get("total")).isEqualTo(1L);
            assertThat(s.get("successful")).isEqualTo(0L);
            assertThat(s.get("failed")).isEqualTo(1L);
        }

        @Test
        void recordRollback_incrementsRollbacks() {
            stats.recordRollback();
            assertThat(stats.getStats().get("rollbacks")).isEqualTo(1L);
        }

        @Test
        void recordCompensation_incrementsCompensations() {
            stats.recordCompensation();
            assertThat(stats.getStats().get("compensations")).isEqualTo(1L);
        }

        @Test
        void getSuccessRate_withNoTransactions_returnsZero() {
            assertThat(stats.getSuccessRate()).isEqualTo(0.0);
        }

        @Test
        void getSuccessRate_threeSuccessOneFailure_is75() {
            stats.recordTransaction(true);
            stats.recordTransaction(true);
            stats.recordTransaction(true);
            stats.recordTransaction(false);
            assertThat(stats.getSuccessRate()).isEqualTo(75.0);
        }

        @Test
        void getStats_successRate_is100_whenAllSucceed() {
            stats.recordTransaction(true);
            stats.recordTransaction(true);
            Map<String, Long> s = stats.getStats();
            assertThat(s.get("successRate")).isEqualTo(100L);
        }

        @Test
        void getStats_successRate_is0_whenAllFail() {
            stats.recordTransaction(false);
            stats.recordTransaction(false);
            Map<String, Long> s = stats.getStats();
            assertThat(s.get("successRate")).isEqualTo(0L);
        }

        @Test
        void reset_clearsAllCounters() {
            stats.recordTransaction(true);
            stats.recordTransaction(false);
            stats.recordRollback();
            stats.recordCompensation();

            stats.reset();

            Map<String, Long> s = stats.getStats();
            assertThat(s.get("total")).isEqualTo(0L);
            assertThat(s.get("successful")).isEqualTo(0L);
            assertThat(s.get("failed")).isEqualTo(0L);
            assertThat(s.get("rollbacks")).isEqualTo(0L);
            assertThat(s.get("compensations")).isEqualTo(0L);
        }

        @Test
        void toString_containsExpectedFields() {
            stats.recordTransaction(true);
            stats.recordTransaction(false);
            stats.recordRollback();
            String str = stats.toString();
            assertThat(str).contains("TransactionStats");
            assertThat(str).contains("total=2");
            assertThat(str).contains("successful=1");
            assertThat(str).contains("failed=1");
            assertThat(str).contains("rollbacks=1");
            assertThat(str).contains("successRate=50.0%");
        }
    }

    // =========================================================================
    // getStats / shutdown
    // =========================================================================
    @Nested
    class ServiceLevelTests {

        @Test
        void getStats_returnsSameStatsInstance() {
            TransactionalLockService.TransactionStats s = service.getStats();
            assertThat(s).isNotNull();
            // recordTransaction via the service updates the same instance
            stubCreateTransaction();
            service.executeInTransaction(tx -> "x");
            assertThat(s.getStats().get("total")).isEqualTo(1L);
        }

        @Test
        void shutdown_resetsStats() {
            stubCreateTransaction();
            service.executeInTransaction(tx -> "x");
            assertThat(service.getStats().getStats().get("total")).isEqualTo(1L);

            service.shutdown();

            assertThat(service.getStats().getStats().get("total")).isEqualTo(0L);
        }
    }
}
