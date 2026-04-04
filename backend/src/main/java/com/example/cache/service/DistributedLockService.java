package com.example.cache.service;

import org.redisson.api.*;
import org.redisson.api.RFencedLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.*;
import java.util.function.Supplier;

/**
 * フェンシングトークンサポート付き分散ロックサービス
 * 分散システム協調のための各種ロックタイプとパターンを提供
 * Java 21の機能を使用: Virtual Threads、パターンマッチング、レコードパターン
 *
 * ## 分散ロックとは
 * 複数のアプリケーションインスタンス間で共有リソースへの排他制御を行う仕組み。
 * データベースの楽観的/悲観的ロックとは異なり、アプリケーションレベルでの協調機能を提供。
 *
 * ## 提供するロック種類
 *
 * ### 1. 標準ロック (Reentrant Lock)
 * - 最も基本的な排他制御
 * - 同一スレッドによる再帰的取得が可能
 * - 自動更新機能（Watchdog）でロック切れを防止
 *
 * ### 2. フェンシングロック (Fenced Lock)
 * - 単調増加するトークンによる最高レベルの安全性
 * - ロック取得順序の検証が可能
 * - stale（古い）操作の実行防止
 *
 * ### 3. 読み書きロック (Read-Write Lock)
 * - 読み取り操作の並行実行を許可
 * - 書き込み操作は排他的に実行
 * - 読み取り頻度が高い場合のパフォーマンス最適化
 *
 * ### 4. フェアロック (Fair Lock)
 * - FIFO（先入れ先出し）順序でロック取得
 * - 飢餓状態（starvation）の防止
 * - パフォーマンスオーバーヘッドに注意
 *
 * ### 5. シャードロック (Sharded Lock)
 * - リソースIDのハッシュ値による分散
 * - ロック競合の削減とスループット向上
 * - 細かい粒度での排他制御
 *
 * ### 6. スピンロック (Spin Lock)
 * - pub/sub代わりにポーリングを使用
 * - 大規模クラスター環境での高性能
 * - 短時間保持のロックに最適
 *
 * ## 使用場面
 * - ファイル処理の排他制御
 * - データ整合性が必要な更新処理
 * - 分散環境でのシーケンス番号生成
 * - キャッシュの更新競合回避
 * - ジョブスケジューリングの重複実行防止
 *
 * ## 監視機能
 * - 包括的なメトリクス収集
 * - ロック取得率、タイムアウト率の追跡
 * - デッドロック検出支援情報
 * - パフォーマンス分析データ
 */
@Service
public class DistributedLockService {
    private static final Logger logger = LoggerFactory.getLogger(DistributedLockService.class);

    private final ExecutorService virtualExecutor;

    // ロック設定定数
    private static final int DEFAULT_WAIT_TIME_SECONDS = 10; // デフォルト待機時間
    private static final int DEFAULT_LEASE_TIME_SECONDS = -1; // Watchdog自動更新（ロック保持中はTTLを定期更新、異常終了時は自動解放）
    private static final int MAX_RETRY_ATTEMPTS = 3; // 最大再試行回数
    private static final long BASE_RETRY_DELAY_MS = 100; // 再試行基底遅延時間
    private static final int LOCK_SHARD_COUNT = 16; // ロックシャーディングのシャード数

    private final RedissonClient redissonClient;

    public DistributedLockService(RedissonClient redissonClient, ExecutorService virtualThreadExecutor) {
        this.redissonClient = redissonClient;
        this.virtualExecutor = virtualThreadExecutor;
    }

    // メトリクス追跡用
    private final LockMetrics metrics = new LockMetrics();

    /**
     * 標準リエントラントロックで操作を実行
     *
     * リエントラント（再帰可能）ロックの特徴：
     * - 同一スレッドによる複数回取得が可能
     * - デッドロック防止に効果的
     * - leaseTimeが-1の場合、Lock Watchdogによる自動更新
     *
     * Lock Watchdog機能：
     * - ロック保持中は定期的にTTLを更新
     * - アプリケーション異常終了時は自動解放
     * - ロング処理でのロック切れを防止
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー（分散環境全体で一意）
     * @param operation ロック保持中に実行する処理
     * @return 実行結果のOptional、ロック取得失敗時はEmpty
     */
    public <T> Optional<T> executeWithLock(String lockKey, Supplier<T> operation) {
        return executeWithLock(lockKey, operation, DEFAULT_WAIT_TIME_SECONDS, DEFAULT_LEASE_TIME_SECONDS);
    }

    /**
     * 標準リエントラントロックで操作を実行（カスタムタイミング）
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation 実行する処理
     * @param waitTime  ロック取得の最大待機時間（秒）
     * @param leaseTime ロック保持の最大時間（秒、-1で自動更新）
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithLock(String lockKey, Supplier<T> operation,
            long waitTime, long leaseTime) {
        RLock lock = redissonClient.getLock(lockKey);
        T result = null;

        try {
            metrics.recordLockAttempt(lockKey);
            logger.debug("ロック取得試行: key={}", lockKey);

            // tryLockでブロッキング時間を制限
            // 無制限待機はデッドロックやパフォーマンス問題の原因となる
            boolean acquired = lock.tryLock(waitTime, leaseTime, TimeUnit.SECONDS);

            if (acquired) {
                metrics.recordLockAcquired(lockKey);
                logger.debug("ロック取得成功: key={}, thread={}",
                        lockKey, Thread.currentThread().getName());

                try {
                    // クリティカルセクション実行
                    result = operation.get();
                    metrics.recordOperationSuccess(lockKey);
                    logger.debug("ロック保持中の処理完了: key={}", lockKey);
                } catch (Exception e) {
                    metrics.recordOperationFailure(lockKey);
                    logger.error("ロック保持中の処理でエラー: key={}", lockKey, e);
                    throw e; // 呼び出し元に例外を伝播
                }
            } else {
                metrics.recordLockTimeout(lockKey);
                logger.warn("ロック取得タイムアウト（{}秒）: key={}", waitTime, lockKey);
            }
        } catch (InterruptedException e) {
            // スレッド割り込み時の適切な処理
            Thread.currentThread().interrupt();
            logger.error("ロック取得中に割り込み発生: key={}", lockKey, e);
        } finally {
            // finally句で確実にロック解放
            // isHeldByCurrentThreadで自スレッドが保持していることを確認
            if (lock.isHeldByCurrentThread()) {
                try {
                    lock.unlock();
                    metrics.recordLockReleased(lockKey);
                    logger.debug("ロック解放完了: key={}", lockKey);
                } catch (Exception e) {
                    logger.error("ロック解放時エラー: key={}", lockKey, e);
                    // ロック解放エラーは深刻な問題の可能性がある
                    // 監視システムでアラートを発生させる必要がある場合がある
                }
            }
        }

        return Optional.ofNullable(result);
    }

    /**
     * フェンシングロックで操作を実行（最高レベルの安全性）
     *
     * フェンシングトークンの仕組み：
     * - ロック取得時に単調増加するトークンを発行
     * - トークンを使って操作の順序性を保証
     * - 古いトークンでの操作実行を防止
     *
     * 使用場面：
     * - データベース更新の順序性が重要
     * - ファイル操作での競合状態回避
     * - 分散環境での状態管理
     *
     * 実装パターン例：
     * ```java
     * service.executeWithFencedLock("update_user", (token) -> {
     * // データベース更新時にtokenを条件に含める
     * return userDao.updateWithToken(userId, newData, token);
     * });
     * ```
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation フェンシングトークンを受け取る処理
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithFencedLock(String lockKey,
            FencedOperation<T> operation) {
        RFencedLock lock = redissonClient.getFencedLock(lockKey);
        T result = null;

        try {
            metrics.recordLockAttempt(lockKey);
            logger.debug("フェンシングロック取得試行: key={}", lockKey);

            // tryLockAndGetTokenで取得と同時にトークン取得
            Long token = lock.tryLockAndGetToken(DEFAULT_WAIT_TIME_SECONDS,
                    DEFAULT_LEASE_TIME_SECONDS,
                    TimeUnit.SECONDS);

            if (token != null) {
                metrics.recordLockAcquired(lockKey);
                logger.info("フェンシングロック取得成功: key={}, token={}", lockKey, token);

                try {
                    // フェンシングトークンを操作に渡す
                    result = operation.execute(token);
                    metrics.recordOperationSuccess(lockKey);
                    logger.debug("フェンシング操作完了: key={}, token={}", lockKey, token);
                } catch (Exception e) {
                    metrics.recordOperationFailure(lockKey);
                    logger.error("フェンシング操作失敗: key={}, token={}", lockKey, token, e);
                    throw new RuntimeException("フェンシング操作失敗: key=" + lockKey, e);
                }
            } else {
                metrics.recordLockTimeout(lockKey);
                logger.warn("フェンシングロック取得失敗: key={}", lockKey);
            }
        } finally {
            // フェンシングロックも適切に解放
            if (lock.isHeldByCurrentThread()) {
                try {
                    lock.unlock();
                    metrics.recordLockReleased(lockKey);
                    logger.debug("フェンシングロック解放: key={}", lockKey);
                } catch (Exception e) {
                    logger.error("フェンシングロック解放エラー: key={}", lockKey, e);
                }
            }
        }

        return Optional.ofNullable(result);
    }

    /**
     * 読み取り専用ロックで操作を実行
     *
     * 読み書きロック（Reader-Writer Lock）の仕組み：
     * - 複数の読み取り操作は並行実行可能
     * - 書き込み操作は排他的に実行
     * - 読み取り中は新しい書き込みをブロック
     * - 書き込み中は読み取りと書き込みをブロック
     *
     * 適用場面：
     * - 設定情報の読み取り（頻繁）vs 更新（稀）
     * - キャッシュデータの参照 vs 無効化
     * - 統計データの集計 vs データ更新
     *
     * パフォーマンス特性：
     * - 読み取り頻度が高い場合に効果的
     * - 書き込み頻度が高い場合は標準ロックを推奨
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation 読み取り処理
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithReadLock(String lockKey, Supplier<T> operation) {
        RReadWriteLock rwLock = redissonClient.getReadWriteLock(lockKey);
        RLock readLock = rwLock.readLock();
        T result = null;

        try {
            if (readLock.tryLock(DEFAULT_WAIT_TIME_SECONDS, DEFAULT_LEASE_TIME_SECONDS, TimeUnit.SECONDS)) {
                logger.debug("読み取りロック取得: key={}", lockKey);

                // 読み取り操作実行（他の読み取り操作と並行実行可能）
                result = operation.get();

                logger.debug("読み取り処理完了: key={}", lockKey);
            } else {
                logger.warn("読み取りロック取得タイムアウト: key={}", lockKey);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("読み取りロック取得中に割り込み: key={}", lockKey, e);
        } finally {
            if (readLock.isHeldByCurrentThread()) {
                readLock.unlock();
                logger.debug("読み取りロック解放: key={}", lockKey);
            }
        }

        return Optional.ofNullable(result);
    }

    /**
     * 書き込み専用ロックで操作を実行
     *
     * 書き込みロックの特徴：
     * - 完全排他制御（読み取りと書き込みの両方をブロック）
     * - データの整合性を厳密に保証
     * - パフォーマンスは標準ロックと同等
     *
     * 注意事項：
     * - 書き込み頻度が高い場合は読み書きロックの利点が薄れる
     * - ロック保持時間を最小限に抑える
     * - 書き込み処理中のデッドロックに注意
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation 書き込み処理
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithWriteLock(String lockKey, Supplier<T> operation) {
        RReadWriteLock rwLock = redissonClient.getReadWriteLock(lockKey);
        RLock writeLock = rwLock.writeLock();
        T result = null;

        try {
            if (writeLock.tryLock(DEFAULT_WAIT_TIME_SECONDS, DEFAULT_LEASE_TIME_SECONDS, TimeUnit.SECONDS)) {
                logger.debug("書き込みロック取得: key={}", lockKey);

                // 排他的書き込み操作実行
                result = operation.get();

                logger.debug("書き込み処理完了: key={}", lockKey);
            } else {
                logger.warn("書き込みロック取得タイムアウト: key={}", lockKey);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("書き込みロック取得中に割り込み: key={}", lockKey, e);
        } finally {
            if (writeLock.isHeldByCurrentThread()) {
                writeLock.unlock();
                logger.debug("書き込みロック解放: key={}", lockKey);
            }
        }

        return Optional.ofNullable(result);
    }

    /**
     * フェアロックで操作を実行（FIFO順序保証）
     *
     * フェアロック（公平ロック）の特徴：
     * - 先入れ先出し（FIFO）順序でロック取得
     * - 長時間待機するスレッドを優先
     * - 飢餓状態（starvation）の防止
     *
     * 使用場面：
     * - 処理順序の公平性が重要
     * - バッチ処理での順序保証
     * - ユーザーからの要求に対する公平な処理
     *
     * パフォーマンス注意点：
     * - 標準ロックより約10-30%のオーバーヘッド
     * - 高頻度ロックではスループットが低下
     * - 本当に公平性が必要な場合のみ使用を推奨
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation 実行する処理
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithFairLock(String lockKey, Supplier<T> operation) {
        RLock fairLock = redissonClient.getFairLock(lockKey);
        T result = null;

        try {
            if (fairLock.tryLock(DEFAULT_WAIT_TIME_SECONDS, DEFAULT_LEASE_TIME_SECONDS, TimeUnit.SECONDS)) {
                logger.debug("フェアロック取得（FIFO順序）: key={}", lockKey);

                result = operation.get();

                logger.debug("フェア処理完了: key={}", lockKey);
            } else {
                logger.warn("フェアロック取得失敗: key={}", lockKey);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("フェアロック取得中に割り込み: key={}", lockKey, e);
        } finally {
            if (fairLock.isHeldByCurrentThread()) {
                fairLock.unlock();
                logger.debug("フェアロック解放: key={}", lockKey);
            }
        }

        return Optional.ofNullable(result);
    }

    /**
     * ロック取得を試みて操作を実行する内部ヘルパー。
     * 戻り値の意味:
     *   - empty()          → ロック取得失敗（タイムアウト）: リトライすべき
     *   - of(empty())      → ロック取得成功、操作が null を返した: リトライ不要
     *   - of(of(value))    → ロック取得成功、操作が value を返した: リトライ不要
     */
    private <T> Optional<Optional<T>> tryExecuteWithLockOnce(String lockKey, Supplier<T> operation) {
        RLock lock = redissonClient.getLock(lockKey);
        try {
            metrics.recordLockAttempt(lockKey);
            boolean acquired = lock.tryLock(DEFAULT_WAIT_TIME_SECONDS, DEFAULT_LEASE_TIME_SECONDS,
                    TimeUnit.SECONDS);
            if (!acquired) {
                metrics.recordLockTimeout(lockKey);
                logger.debug("ロック取得失敗（タイムアウト）: key={}", lockKey);
                return Optional.empty(); // ロック取得失敗 → リトライ対象
            }
            metrics.recordLockAcquired(lockKey);
            try {
                T result = operation.get();
                metrics.recordOperationSuccess(lockKey);
                return Optional.of(Optional.ofNullable(result)); // ロック取得成功 → リトライ不要
            } catch (Exception e) {
                metrics.recordOperationFailure(lockKey);
                throw e;
            } finally {
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
                    metrics.recordLockReleased(lockKey);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("ロック取得中に割り込み発生: key={}", lockKey, e);
            return Optional.of(Optional.empty());
        }
    }

    /**
     * 自動リトライと指数バックオフ付きで操作を実行
     *
     * 指数バックオフ戦略：
     * - 1回目: 100ms待機後リトライ
     * - 2回目: 400ms待機後リトライ
     * - 3回目: 800ms待機後リトライ
     *
     * リトライはロック取得失敗時のみ行い、操作が Optional.empty() を返した場合はリトライしない。
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation 実行する処理
     * @return 実行結果のOptional、全てのリトライが失敗した場合Empty
     */
    public <T> Optional<T> executeWithRetry(String lockKey, Supplier<T> operation) {
        int attempts = 0;
        Exception lastException = null;

        while (attempts < MAX_RETRY_ATTEMPTS) {
            try {
                Optional<Optional<T>> lockResult = tryExecuteWithLockOnce(lockKey, operation);
                if (lockResult.isPresent()) {
                    // ロック取得成功 → 操作結果を返す（空でもリトライしない）
                    if (attempts > 0) {
                        logger.info("リトライ成功: key={}, attempts={}", lockKey, attempts + 1);
                    }
                    return lockResult.get();
                }
                // ロック取得失敗 → リトライ
            } catch (Exception e) {
                lastException = e;
                logger.warn("リトライ{}回目失敗 key={}: {}", attempts + 1, lockKey, e.getMessage());
            }

            attempts++;
            if (attempts < MAX_RETRY_ATTEMPTS) {
                // 指数バックオフ: 100ms * 2^attempts
                long delay = BASE_RETRY_DELAY_MS * (long) Math.pow(2, attempts);
                logger.debug("{}ms後にリトライ実行 key={}", delay, lockKey);

                try {
                    Thread.sleep(delay);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    logger.error("リトライ待機中に割り込み発生", e);
                    break;
                }
            }
        }

        logger.error("全リトライ失敗（{}回試行）: key={}", MAX_RETRY_ATTEMPTS, lockKey, lastException);
        return Optional.empty();
    }

    /**
     * ロック競合削減のためのシャード化ロックで操作を実行
     *
     * ロックシャーディング戦略：
     * - リソースIDのハッシュ値を使用してシャード決定
     * - 16のシャードに分散（LOCK_SHARD_COUNT = 16）
     * - 各シャードで独立したロック管理
     *
     * 効果：
     * - ロック競合を1/16に削減
     * - スループットの大幅向上
     * - ホットスポット（競合集中）の回避
     *
     * 使用場面：
     * - 大量の細かい処理が並行実行される場合
     * - リソースID単位での排他制御
     * - ユーザーID別処理の最適化
     *
     * 注意点：
     * - 完全排他が不要な場合のみ使用
     * - 同一リソースの処理は依然として排他制御される
     *
     * 実装例：
     * ```java
     * // ユーザーID "user123" の場合
     * // hash("user123") % 16 = 5 → "sharded_lock_5" を使用
     * service.executeWithShardedLock("user123", () -> {
     * return processUserData("user123");
     * });
     * ```
     *
     * @param <T>        戻り値の型
     * @param resourceId リソースID（シャード決定用）
     * @param operation  実行する処理
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithShardedLock(String resourceId, Supplier<T> operation) {
        // Math.abs(Integer.MIN_VALUE) の負値バグを回避
        // Math.floorMod は常に 0 <= result < N を保証する
        int shard = Math.floorMod(resourceId.hashCode(), LOCK_SHARD_COUNT);
        String lockKey = String.format("sharded_lock_%d", shard);

        logger.debug("シャードロック使用: resource={} → shard={}", resourceId, shard);
        return executeWithLock(lockKey, operation);
    }

    /**
     * 高スループットシナリオ用のスピンロックで操作を実行
     *
     * スピンロック vs 標準ロック：
     *
     * **標準ロック（pub/subベース）**：
     * - Redis pub/subでロック解放を通知
     * - 大規模クラスターでは通知遅延が発生
     * - メモリ使用量が多い
     *
     * **スピンロック（ポーリングベース）**：
     * - 定期的にロック状態をポーリング
     * - ネットワーク遅延の影響を受けにくい
     * - 大規模環境での安定性が高い
     *
     * 適用場面：
     * - 短時間（数秒以内）のロック保持
     * - 高頻度でのロック取得が必要
     * - 大規模Redisクラスター環境
     * - レイテンシよりスループット重視
     *
     * 注意事項：
     * - 長時間のロック保持には不適切
     * - ポーリングによるCPU使用量増加
     * - 指数バックオフでポーリング頻度を調整
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation 実行する処理（短時間推奨）
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithSpinLock(String lockKey, Supplier<T> operation) {
        RLock spinLock = redissonClient.getSpinLock(lockKey);
        T result = null;

        try {
            // スピンロックは短い待機時間を設定（ポーリングによる CPU 負荷を抑えるため）
            // 長時間待機する場合は標準ロックを使用すべき
            if (spinLock.tryLock(5, DEFAULT_LEASE_TIME_SECONDS, TimeUnit.SECONDS)) {
                logger.debug("スピンロック取得: key={}", lockKey);

                result = operation.get();

                logger.debug("スピン処理完了: key={}", lockKey);
            } else {
                logger.debug("スピンロック取得タイムアウト: key={}", lockKey);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("スピンロック取得中に割り込み: key={}", lockKey, e);
        } finally {
            if (spinLock.isHeldByCurrentThread()) {
                spinLock.unlock();
                logger.debug("スピンロック解放: key={}", lockKey);
            }
        }

        return Optional.ofNullable(result);
    }

    /**
     * CompletableFutureによる非同期ロック取得
     *
     * Virtual Threadsを活用した効率的な非同期処理：
     *
     * ## 従来のThread Pool vs Virtual Threads
     * **従来方式**：
     * - OSスレッド消費（通常8KB-2MBのスタック）
     * - 同時実行数に制限（通常200-1000スレッド）
     * - コンテキストスイッチのオーバーヘッド
     *
     * **Virtual Threads（Java 21）**：
     * - 軽量（数KB程度）
     * - 数百万の同時実行が可能
     * - ブロッキングI/Oでの効率的な処理
     *
     * ## 使用場面
     * - 大量の並行ロック処理
     * - ノンブロッキングAPIとの統合
     * - マイクロサービス間のロック協調
     * - リアクティブプログラミングとの組み合わせ
     *
     * ## 実装例
     * ```java
     * // 複数のロックを並行実行
     * List<CompletableFuture<Optional<String>>> futures = keys.stream()
     * .map(key -> service.executeWithLockAsync(key, () -> process(key)))
     * .toList();
     *
     * CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
     * .thenApply(v -> futures.stream()
     * .map(CompletableFuture::join)
     * .collect(Collectors.toList()));
     * ```
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー
     * @param operation 実行する処理
     * @return 実行結果のOptionalを返すCompletableFuture
     */
    public <T> CompletableFuture<Optional<T>> executeWithLockAsync(String lockKey,
            Supplier<T> operation) {
        return CompletableFuture.supplyAsync(() -> {
            logger.debug("非同期ロック処理開始: key={}, thread={}",
                    lockKey, Thread.currentThread().getName());
            return executeWithLock(lockKey, operation);
        }, virtualExecutor)
                .exceptionally(throwable -> {
                    logger.error("非同期ロック処理で例外: key={}", lockKey, throwable);
                    return Optional.empty();
                });
    }

    /**
     * ロックが現在保持されているかチェック
     *
     * 用途：
     * - ロック状態の監視
     * - デバッグ時の状態確認
     * - ロック競合の分析
     *
     * 注意：
     * - この情報は取得時点のもの
     * - 分散環境では情報の遅延がある可能性
     * - ロック取得の可否判定には使用しない（競合状態のため）
     *
     * @param lockKey ロックキー
     * @return ロックが保持されている場合true
     */
    public boolean isLocked(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        boolean locked = lock.isLocked();
        logger.debug("ロック状態確認: key={}, locked={}", lockKey, locked);
        return locked;
    }

    /**
     * ロックを強制解除（注意して使用）
     *
     * 強制解除の危険性：
     * - 他のスレッドが実行中の処理を中断する可能性
     * - データ不整合の原因となる可能性
     * - 分散環境でのデッドロックを引き起こす可能性
     *
     * 適切な使用場面：
     * - デッドロック発生時の緊急対応
     * - アプリケーション異常終了後のクリーンアップ
     * - 管理者による手動介入
     * - テストコードでのリセット処理
     *
     * 安全な使用方法：
     * 1. ログで強制解除を記録
     * 2. 影響範囲を事前に確認
     * 3. ダウンタイム中の実行を推奨
     * 4. 監視システムでアラート発生
     *
     * @param lockKey 強制解除するロックキー
     * @return 現在のスレッドが保持していた場合true
     */
    public boolean forceUnlock(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        if (lock.isLocked()) {
            lock.forceUnlock();
            logger.warn("ロック強制解除実行: key={} ※データ整合性に注意", lockKey);
            return true;
        } else {
            logger.debug("強制解除スキップ（ロックなし）: key={}", lockKey);
            return false;
        }
    }

    /**
     * 監視用ロックメトリクスを取得
     *
     * メトリクス活用方法：
     * - ロック競合頻度の分析
     * - パフォーマンスボトルネックの特定
     * - SLA監視とアラート設定
     * - キャパシティプランニング
     *
     * @return LockMetricsオブジェクト
     */
    public LockMetrics getMetrics() {
        return metrics;
    }

    /**
     * リソースクリーンアップ
     *
     * アプリケーション終了時に実行：
     * - メトリクス情報のリセット
     * - 統計データのエクスポート（必要に応じて）
     */
    public void shutdown() {
        logger.info("DistributedLockService シャットダウン開始");
        virtualExecutor.shutdown();
        try {
            if (!virtualExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                logger.warn("VirtualExecutor がタイムアウト内に終了しませんでした");
                virtualExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            virtualExecutor.shutdownNow();
        }
        logger.info("DistributedLockService シャットダウン完了");
    }

    /**
     * フェンシング操作用関数型インターフェース
     *
     * フェンシングトークンを受け取って処理を実行する操作を定義
     *
     * @param <T> 戻り値の型
     */
    @FunctionalInterface
    public interface FencedOperation<T> {
        /**
         * フェンシングトークン付き操作の実行
         *
         * @param fencingToken 単調増加するロック取得順序トークン
         * @return 処理結果
         * @throws Exception 処理中に発生した例外
         */
        T execute(Long fencingToken) throws Exception;
    }

    /**
     * ロックメトリクス監視・アラート用クラス
     *
     * 分散ロックシステムの運用監視に必要な統計情報を収集・提供します。
     *
     * ## 監視指標
     * - **取得率**: 成功取得数/試行数（目安：95%以上）
     * - **タイムアウト率**: タイムアウト数/試行数（目安：5%以下）
     * - **操作成功率**: 成功実行数/取得数（目安：99%以上）
     *
     * ## アラート閾値例
     * - 取得率 < 90%: WARNING
     * - 取得率 < 80%: CRITICAL
     * - タイムアウト率 > 10%: WARNING
     * - 操作失敗率 > 1%: WARNING
     *
     * ## ダッシュボード活用
     * ```java
     * // 定期的なメトリクス取得
     * Map<String, LockStats> stats = lockService.getMetrics().getAllStats();
     * stats.forEach((lockKey, stat) -> {
     * double successRate = (double) stat.acquisitions() / stat.attempts();
     * metricsRegistry.gauge("lock.success_rate", successRate, "lock", lockKey);
     * });
     * ```
     */
    public static class LockMetrics {
        private final ConcurrentHashMap<String, LockStats> lockStats = new ConcurrentHashMap<>();

        /**
         * ロック統計情報レコード
         * Java 21のRecord機能を使用した不変データクラス
         *
         * @param attempts           試行回数
         * @param acquisitions       取得成功回数
         * @param timeouts           タイムアウト回数
         * @param releases           解放回数
         * @param operationSuccesses 操作成功回数
         * @param operationFailures  操作失敗回数
         */
        public record LockStats(
                long attempts, // ロック取得試行回数
                long acquisitions, // ロック取得成功回数
                long timeouts, // ロック取得タイムアウト回数
                long releases, // ロック解放回数
                long operationSuccesses, // ロック保持中の操作成功回数
                long operationFailures // ロック保持中の操作失敗回数
        ) {
            /**
             * ロック取得成功率を計算
             *
             * @return 成功率（0.0-1.0）
             */
            public double getSuccessRate() {
                return attempts > 0 ? (double) acquisitions / attempts : 0.0;
            }

            /**
             * タイムアウト率を計算
             *
             * @return タイムアウト率（0.0-1.0）
             */
            public double getTimeoutRate() {
                return attempts > 0 ? (double) timeouts / attempts : 0.0;
            }

            /**
             * 操作成功率を計算（ロック取得成功時の）
             *
             * @return 操作成功率（0.0-1.0）
             */
            public double getOperationSuccessRate() {
                long totalOperations = operationSuccesses + operationFailures;
                return totalOperations > 0 ? (double) operationSuccesses / totalOperations : 0.0;
            }
        }

        /**
         * ロック取得試行を記録
         */
        // ConcurrentHashMap.compute() はアトミック操作のため synchronized は不要
        void recordLockAttempt(String lockKey) {
            lockStats.compute(lockKey, (k, v) -> {
                if (v == null) {
                    return new LockStats(1, 0, 0, 0, 0, 0);
                }
                return new LockStats(v.attempts + 1, v.acquisitions, v.timeouts,
                        v.releases, v.operationSuccesses, v.operationFailures);
            });
        }

        /**
         * ロック取得成功を記録
         */
        // ConcurrentHashMap.compute() はアトミック操作のため synchronized は不要
        void recordLockAcquired(String lockKey) {
            lockStats.compute(lockKey, (k, v) -> {
                if (v == null) {
                    return new LockStats(0, 1, 0, 0, 0, 0);
                }
                return new LockStats(v.attempts, v.acquisitions + 1, v.timeouts,
                        v.releases, v.operationSuccesses, v.operationFailures);
            });
        }

        /**
         * ロック取得タイムアウトを記録
         */
        // ConcurrentHashMap.compute() はアトミック操作のため synchronized は不要
        void recordLockTimeout(String lockKey) {
            lockStats.compute(lockKey, (k, v) -> {
                if (v == null) {
                    return new LockStats(0, 0, 1, 0, 0, 0);
                }
                return new LockStats(v.attempts, v.acquisitions, v.timeouts + 1,
                        v.releases, v.operationSuccesses, v.operationFailures);
            });
        }

        /**
         * ロック解放を記録
         */
        // ConcurrentHashMap.compute() はアトミック操作のため synchronized は不要
        void recordLockReleased(String lockKey) {
            lockStats.compute(lockKey, (k, v) -> {
                if (v == null) {
                    return new LockStats(0, 0, 0, 1, 0, 0);
                }
                return new LockStats(v.attempts, v.acquisitions, v.timeouts,
                        v.releases + 1, v.operationSuccesses, v.operationFailures);
            });
        }

        /**
         * 操作成功を記録
         */
        // ConcurrentHashMap.compute() はアトミック操作のため synchronized は不要
        void recordOperationSuccess(String lockKey) {
            lockStats.compute(lockKey, (k, v) -> {
                if (v == null) {
                    return new LockStats(0, 0, 0, 0, 1, 0);
                }
                return new LockStats(v.attempts, v.acquisitions, v.timeouts,
                        v.releases, v.operationSuccesses + 1, v.operationFailures);
            });
        }

        /**
         * 操作失敗を記録
         */
        // ConcurrentHashMap.compute() はアトミック操作のため synchronized は不要
        void recordOperationFailure(String lockKey) {
            lockStats.compute(lockKey, (k, v) -> {
                if (v == null) {
                    return new LockStats(0, 0, 0, 0, 0, 1);
                }
                return new LockStats(v.attempts, v.acquisitions, v.timeouts,
                        v.releases, v.operationSuccesses, v.operationFailures + 1);
            });
        }

        /**
         * 全ロックの統計情報を取得
         *
         * @return ロックキーをキーとするLockStatsのマップ
         */
        public Map<String, LockStats> getAllStats() {
            return new ConcurrentHashMap<>(lockStats);
        }

        /**
         * 統計情報をリセット
         *
         * 使用場面：
         * - 定期的な統計のリセット
         * - テスト時のクリーンアップ
         * - アプリケーション再起動時
         */
        public synchronized void reset() {
            lockStats.clear();
            logger.debug("ロックメトリクスがリセットされました");
        }

        /**
         * メトリクスサマリーを取得
         *
         * @return 全ロックの集約統計情報
         */
        public synchronized LockStats getTotalStats() {
            if (lockStats.isEmpty()) {
                return new LockStats(0, 0, 0, 0, 0, 0);
            }

            long totalAttempts = 0, totalAcquisitions = 0, totalTimeouts = 0;
            long totalReleases = 0, totalOperationSuccesses = 0, totalOperationFailures = 0;

            for (LockStats stats : lockStats.values()) {
                totalAttempts += stats.attempts;
                totalAcquisitions += stats.acquisitions;
                totalTimeouts += stats.timeouts;
                totalReleases += stats.releases;
                totalOperationSuccesses += stats.operationSuccesses;
                totalOperationFailures += stats.operationFailures;
            }

            return new LockStats(totalAttempts, totalAcquisitions, totalTimeouts,
                    totalReleases, totalOperationSuccesses, totalOperationFailures);
        }
    }
}
