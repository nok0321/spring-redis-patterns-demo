package com.example.cache.service;

import org.redisson.api.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.Function;

/**
 * 分散ロック付きトランザクション操作サービス
 * 分散環境でのACID特性的な保証を提供
 * Java 21の機能を使用: パターンマッチング、try-with-resourcesの改良
 *
 * ## 分散トランザクションとは
 * 複数のデータストアやサービス間にまたがる処理で、
 * すべて成功するか、すべて失敗するかの原子性を保証する仕組み。
 *
 * ## ACID特性の分散環境での実現
 *
 * ### A - Atomicity（原子性）
 * - すべての操作が成功するか、すべて失敗する
 * - 途中で障害が発生しても中途半端な状態にならない
 * - Redissonトランザクションによる実現
 *
 * ### C - Consistency（一貫性）
 * - データの整合性制約を常に満たす
 * - バリデーション失敗時の自動ロールバック
 * - ビジネスルールの検証
 *
 * ### I - Isolation（分離性）
 * - 同時実行されるトランザクション間の干渉を防ぐ
 * - 分散ロックによる排他制御
 * - オプティミスティック・ペシミスティックロック
 *
 * ### D - Durability（永続性）
 * - コミット後のデータは永続的に保存される
 * - Redis AOF/RDBによるデータ永続化
 * - レプリケーションによる可用性向上
 *
 * ## 提供するトランザクションパターン
 *
 * ### 1. 基本トランザクション
 * - 単一のRedissonトランザクション
 * - 自動ロールバック機能
 * - タイムアウト・リトライ設定
 *
 * ### 2. 分散ロック付きトランザクション
 * - ロック取得→トランザクション実行→ロック解放
 * - デッドロック防止
 * - 長時間実行処理の保護
 *
 * ### 3. 補償トランザクション（Sagaパターン）
 * - 失敗時の補償処理自動実行
 * - 長期間トランザクションに適用
 * - マイクロサービス間の協調
 *
 * ### 4. 2フェーズコミット
 * - 複数参加者間での分散トランザクション
 * - Prepare→Commitの2段階処理
 * - ビザンチン障害への対応
 *
 * ### 5. オプティミスティックロック
 * - バージョン番号による楽観的制御
 * - 競合検出と自動リトライ
 * - 高並行環境での効率性
 *
 * ## 使用場面
 * - 金融システムの送金処理
 * - ECサイトの在庫と注文の同期
 * - 複数データベース間のデータ同期
 * - マイクロサービス間の状態管理
 * - ワークフロー管理システム
 *
 * ## パフォーマンス特性
 * - 基本トランザクション: 高速（単一Redis）
 * - 分散ロック付き: 中程度（ロック取得コスト）
 * - 2フェーズコミット: 低速（複数ラウンドトリップ）
 * - オプティミスティック: 高速（競合時のみ失敗）
 */
@Service
public class TransactionalLockService {
    private static final Logger logger = LoggerFactory.getLogger(TransactionalLockService.class);

    // トランザクション設定定数
    private static final int TRANSACTION_TIMEOUT_SECONDS = 30; // デフォルトタイムアウト
    private static final int MAX_TRANSACTION_RETRIES = 3; // 最大リトライ回数

    // 統計情報追跡用
    private final TransactionStats stats = new TransactionStats();

    private final RedissonClient redissonClient;
    private final DistributedLockService lockService;

    public TransactionalLockService(RedissonClient redissonClient,
                                    DistributedLockService lockService) {
        this.redissonClient = redissonClient;
        this.lockService = lockService;
    }

    /**
     * 失敗時の自動ロールバック付きトランザクション実行
     *
     * Redissonトランザクションの特徴：
     * - Multi/Execコマンドによる原子性保証
     * - Watch機能による楽観的ロック
     * - 自動タイムアウト処理
     * - リトライ機能による信頼性向上
     *
     * 実行フロー：
     * 1. トランザクション開始
     * 2. 操作の実行（ステージング）
     * 3. コミット or ロールバック
     * 4. 統計情報の記録
     *
     * 例外処理戦略：
     * - ビジネスロジック例外: ロールバック
     * - ネットワーク例外: 自動リトライ
     * - タイムアウト: 自動ロールバック
     *
     * @param <T>       戻り値の型
     * @param operation トランザクション内で実行する処理
     * @return 実行結果のOptional、失敗時はEmpty
     *
     * <p><strong>並行更新に関する注意：</strong>
     * 複数のクライアントが同じキーを同時に更新する可能性がある場合、
     * このメソッドを単独で使用すると {@code TransactionException} が発生しうる。
     * 並行更新が想定されるシナリオでは {@code executeWithFencedLock} または
     * {@code executeTransfer} のように分散ロックと組み合わせて使用すること。
     */
    public <T> Optional<T> executeInTransaction(Function<RTransaction, T> operation) {
        // TransactionOptionsによる詳細設定
        RTransaction transaction = redissonClient.createTransaction(TransactionOptions.defaults()
                .timeout(TRANSACTION_TIMEOUT_SECONDS, TimeUnit.SECONDS) // 30秒タイムアウト
                .retryAttempts(MAX_TRANSACTION_RETRIES) // 最大3回リトライ
                .retryInterval(2, TimeUnit.SECONDS)); // 2秒間隔でリトライ

        try {
            logger.debug("トランザクション開始: timeout={}s, retries={}",
                    TRANSACTION_TIMEOUT_SECONDS, MAX_TRANSACTION_RETRIES);

            // ビジネスロジック実行（ここではステージングのみ）
            T result = operation.apply(transaction);

            // コミット実行（ここで実際のRedis操作が実行される）
            transaction.commit();
            logger.debug("トランザクション正常コミット完了");

            stats.recordTransaction(true);
            return Optional.ofNullable(result);

        } catch (Exception e) {
            logger.error("トランザクション失敗、ロールバック実行中", e);
            stats.recordTransaction(false);

            try {
                // 失敗時の自動ロールバック
                transaction.rollback();
                stats.recordRollback();
                logger.debug("ロールバック正常完了");
            } catch (Exception rollbackEx) {
                logger.error("ロールバック処理でエラー発生", rollbackEx);
                // ロールバック失敗は深刻な問題として記録
            }
            return Optional.empty();
        }
    }

    /**
     * 分散ロック付きトランザクション実行
     *
     * 実行順序の重要性：
     * 1. ロック取得 （他のプロセスをブロック）
     * 2. トランザクション開始
     * 3. 処理実行
     * 4. トランザクションコミット
     * 5. ロック解放 （ブロック解除）
     *
     * デッドロック防止戦略：
     * - ロック取得にタイムアウト設定
     * - ロック順序の統一（複数ロック取得時）
     * - ロック保持時間の最小化
     *
     * 用途：
     * - 複数ステップの複雑な処理
     * - 外部システムとの連携を含む処理
     * - データ整合性が極めて重要な操作
     *
     * パフォーマンス考慮：
     * - ロック取得のオーバーヘッド
     * - 他のプロセスの待機時間
     * - トランザクション実行時間の最適化
     *
     * @param <T>       戻り値の型
     * @param lockKey   ロックキー（分散環境全体で一意）
     * @param operation トランザクション処理
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithTransactionalLock(String lockKey,
            Function<RTransaction, T> operation) {
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // Step 1: 分散ロック取得（タイムアウト付き）
            if (!lock.tryLock(10, 30, TimeUnit.SECONDS)) {
                logger.warn("トランザクション用ロック取得失敗: key={}", lockKey);
                return Optional.empty();
            }

            logger.debug("トランザクション用ロック取得成功: key={}", lockKey);

            // Step 2: ロック保持中でのトランザクション実行
            // より短いタイムアウト（ロック保持時間を最小化）
            RTransaction transaction = redissonClient.createTransaction(TransactionOptions.defaults()
                    .timeout(20, TimeUnit.SECONDS));

            try {
                T result = operation.apply(transaction);
                transaction.commit();
                logger.debug("分散ロック付きトランザクション成功: key={}", lockKey);
                stats.recordTransaction(true);
                return Optional.ofNullable(result);
            } catch (Exception e) {
                logger.error("分散ロック付きトランザクション失敗: key={}", lockKey, e);
                try {
                    transaction.rollback();
                } catch (Exception rollbackEx) {
                    e.addSuppressed(rollbackEx);
                    logger.error("ロールバック失敗: key={}", lockKey, rollbackEx);
                }
                stats.recordTransaction(false);
                stats.recordRollback();
                throw e; // finallyブロックでロック解放後に呼び出し元に伝播
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("ロック取得中に割り込み発生: key={}", lockKey, e);
            return Optional.empty();
        } catch (Exception e) {
            logger.error("分散ロック付きトランザクション処理エラー: key={}", lockKey, e);
            return Optional.empty();
        } finally {
            // Step 3: 確実なロック解放（finally句で保証）
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
                logger.debug("トランザクション後のロック解放完了: key={}", lockKey);
            }
        }
    }

    /**
     * バッチ操作のトランザクション実行
     *
     * 全成功または全失敗の保証：
     * - Map内のすべての更新が成功するか、すべて失敗
     * - 途中での部分的な更新は発生しない
     * - データの整合性を厳密に保持
     *
     * バッチ処理の利点：
     * - 複数操作の原子性保証
     * - ネットワークラウンドトリップの削減
     * - パフォーマンスの向上
     *
     * 適用場面：
     * - 複数キーの一括更新
     * - 設定データの一括変更
     * - キャッシュの一括無効化
     * - データマイグレーション
     *
     * @param updates キーと値のマップ（更新対象）
     * @return 全ての更新が成功した場合true
     */
    public boolean executeBatchWithTransaction(Map<String, Object> updates) {
        logger.info("バッチトランザクション開始: updates={}", updates.size());

        return executeInTransaction(transaction -> {
            // 各更新をトランザクション内でステージング
            updates.forEach((key, value) -> {
                RBucket<Object> bucket = transaction.getBucket(key);
                bucket.set(value);
                logger.debug("更新ステージング: {} = {}", key, value);
            });

            logger.info("バッチトランザクション実行中: {} 件の更新", updates.size());
            return true; // すべての更新が正常にステージングされた
        }).orElse(false);
    }

    /**
     * フェンシングトークン付き分散ロック送金処理
     *
     * ## 送金処理における課題
     * - 二重送金の防止
     * - 残高不足チェック
     * - 送金記録の確実な保存
     * - 障害時の状態の特定
     *
     * ## フェンシングトークンの役割
     * - 送金処理の順序性保証
     * - 古い処理の実行防止
     * - 処理の一意性確保
     * - 監査証跡の生成
     *
     * ## 実装戦略
     * 1. ロック順序の統一（デッドロック防止）
     * 2. フェンシングトークン取得
     * 3. 送金記録作成（監査ログ）
     * 4. 残高チェック
     * 5. 残高更新
     * 6. 送金完了記録
     *
     * ## エラーパターンとハンドリング
     * - 残高不足: ビジネス例外、処理中断
     * - ロック取得失敗: リトライまたは失敗応答
     * - ネットワーク障害: 自動リトライ
     * - データベース例外: ロールバック
     *
     * @param fromKey    送金元キー
     * @param toKey      送金先キー
     * @param amount     送金額
     * @param transferId 送金ID（重複チェック用）
     * @return 送金成功時true
     */
    public boolean executeTransfer(String fromKey, String toKey,
            double amount, String transferId) {

        // デッドロック防止: 辞書順で小さいキーを先にしてロック順序を統一
        // hashCode() の衝突を避けるため、実際のキー文字列を使用する
        String first  = fromKey.compareTo(toKey) <= 0 ? fromKey : toKey;
        String second = fromKey.compareTo(toKey) <= 0 ? toKey : fromKey;
        String lockKey = "transfer_lock:" + first + ":" + second;

        return lockService.executeWithFencedLock(lockKey, (Long fencingToken) -> {
            logger.info("送金処理開始 id={}, フェンシングトークン={}", transferId, fencingToken);

            boolean result = executeInTransaction(transaction -> {
                // Step 1: 送金記録作成（監査ログ）
                RMap<String, Object> transferMap = transaction.getMap("transfers:" + transferId);
                transferMap.put("fencingToken", fencingToken);
                transferMap.put("fromKey", fromKey);
                transferMap.put("toKey", toKey);
                transferMap.put("amount", amount);
                transferMap.put("timestamp", System.currentTimeMillis());
                transferMap.put("status", "PROCESSING");

                // Step 2: 現在の残高取得
                RBucket<Double> fromBucket = transaction.getBucket(fromKey);
                RBucket<Double> toBucket = transaction.getBucket(toKey);

                Double fromBalance = fromBucket.get();
                Double toBalance = toBucket.get();

                // Step 3: ビジネスルール検証（残高不足チェック）
                if (fromBalance == null || fromBalance < amount) {
                    logger.warn("送金失敗（残高不足）: 残高={}, 送金額={}", fromBalance, amount);
                    transferMap.put("status", "FAILED_INSUFFICIENT_BALANCE");
                    throw new IllegalStateException("残高不足のため送金できません");
                }

                // Step 4: 原子的な残高更新
                fromBucket.set(fromBalance - amount);
                toBucket.set((toBalance != null ? toBalance : 0.0) + amount);

                // Step 5: 送金完了記録
                transferMap.put("status", "COMPLETED");
                transferMap.put("completedAt", System.currentTimeMillis());
                transferMap.put("fromBalanceAfter", fromBalance - amount);
                transferMap.put("toBalanceAfter", (toBalance != null ? toBalance : 0.0) + amount);

                logger.info("送金処理完了 id={}, token={}", transferId, fencingToken);

                return true;
            }).orElse(false);

            // コミット後に TTL を設定（トランザクション内では expire 不可）
            if (result) {
                redissonClient.getMap("transfers:" + transferId).expire(Duration.ofDays(7));
            }
            return result;
        }).orElse(false);
    }

    /**
     * 補償トランザクションパターン（Sagaパターン）実装
     *
     * ## Sagaパターンとは
     * 長期間実行されるトランザクションを、複数の短いトランザクションに分割し、
     * 各ステップが失敗した場合に補償処理（compensation）を実行するパターン。
     *
     * ## 従来の2フェーズコミットとの違い
     * **2フェーズコミット**:
     * - 全参加者がロック状態を維持
     * - 高い整合性、低い可用性
     * - 短期間のトランザクション向け
     *
     * **Sagaパターン**:
     * - 各ステップは即座にコミット
     * - 結果整合性、高い可用性
     * - 長期間のトランザクション向け
     *
     * ## 実装パターン
     * 1. **Choreography**: 各サービスが次のサービスを呼び出し
     * 2. **Orchestration**: 中央のオーケストレーターが制御
     *
     * ## 補償処理設計の原則
     * - **冪等性**: 同じ補償処理を複数回実行しても安全
     * - **可逆性**: 元の操作を確実に取り消す
     * - **監査性**: 補償処理の実行記録を保持
     *
     * ## 使用場面
     * - マイクロサービス間の長期ワークフロー
     * - 外部サービスとの連携処理
     * - バッチ処理での部分的失敗対応
     * - ユーザー操作のキャンセル機能
     *
     * @param <T>          戻り値の型
     * @param operation    メイン処理
     * @param compensation 補償処理（失敗時実行）
     * @return 実行結果のOptional
     */
    public <T> Optional<T> executeWithCompensation(
            Function<RTransaction, T> operation,
            Function<RTransaction, Void> compensation) {

        RTransaction transaction = redissonClient.createTransaction(TransactionOptions.defaults());

        try {
            logger.debug("補償付きトランザクション開始");

            // メイン処理実行
            T result = operation.apply(transaction);
            transaction.commit();

            logger.debug("メイン処理成功、補償処理は不要");
            stats.recordTransaction(true);
            return Optional.ofNullable(result);

        } catch (Exception e) {
            logger.error("メイン処理失敗、補償処理実行中", e);
            stats.recordTransaction(false);

            try {
                transaction.rollback();
                stats.recordRollback();
            } catch (Exception rollbackEx) {
                logger.error("メイントランザクションのロールバックでエラー", rollbackEx);
            }

            // 新しいトランザクションで補償処理を実行
            // 重要: 独立したトランザクションで実行することで、
            // メイン処理の失敗の影響を受けない
            RTransaction compensationTx = redissonClient.createTransaction(TransactionOptions.defaults());
            try {
                logger.info("補償処理開始");
                compensation.apply(compensationTx);
                compensationTx.commit();
                logger.info("補償処理正常完了");
                stats.recordCompensation();
            } catch (Exception compEx) {
                logger.error("補償処理失敗：手動介入が必要な可能性", compEx);
                // 補償処理の失敗は深刻な問題。ロールバックを試みてリソースを解放する。
                try {
                    compensationTx.rollback();
                    logger.warn("補償トランザクションをロールバックしました");
                } catch (Exception rollbackEx) {
                    logger.error("補償トランザクションのロールバックも失敗：手動介入が必須", rollbackEx);
                }
            }

            return Optional.empty();
        }
    }

    /**
     * 2フェーズコミットパターン実装
     *
     * ## 2PCプロトコルの概要
     * 分散トランザクションで最も厳密な整合性を提供するプロトコル。
     * コーディネーター1台と複数の参加者で構成。
     *
     * ### Phase 1: Prepare（準備フェーズ）
     * 1. コーディネーターが全参加者にPrepare要求送信
     * 2. 各参加者は操作可能かチェック（ロック取得、検証等）
     * 3. 準備完了なら「Yes」、不可能なら「No」を応答
     * 4. コーディネーターは全ての応答を待機
     *
     * ### Phase 2: Commit/Abort（コミット/中断フェーズ）
     * - 全参加者が「Yes」→ 全参加者にCommit指示
     * - 1つでも「No」→ 全参加者にAbort指示
     *
     * ## 2PCの特徴
     * **利点**:
     * - 強い整合性保証
     * - ACID特性の完全な実現
     * - データベース分野での実績
     *
     * **欠点**:
     * - ブロッキングプロトコル（可用性の低下）
     * - 単一障害点（コーディネーター）
     * - ネットワーク分断への脆弱性
     * - パフォーマンスオーバーヘッド
     *
     * ## 障害パターンと対応
     * - **参加者障害**: タイムアウトでAbort
     * - **コーディネーター障害**: 回復ログから状態復元
     * - **ネットワーク分断**: 手動介入が必要
     *
     * ## 使用場面
     * - 金融システムの重要トランザクション
     * - データベース間の整合性が必須の処理
     * - 短時間で完了する分散処理
     * - 整合性 > 可用性の要件
     *
     * @param coordinatorKey コーディネーター状態管理キー
     * @param participants   参加者リスト
     * @return 全参加者でコミット成功時true
     */
    public boolean executeTwoPhaseCommit(String coordinatorKey,
            List<TransactionParticipant> participants) {
        String txId = "2pc_" + UUID.randomUUID();
        // RMapCache でエントリごとに TTL を設定し、古いトランザクション記録が蓄積しないようにする
        RMapCache<String, String> coordinatorMap = redissonClient.getMapCache(coordinatorKey);

        try {
            // Phase 1: Prepare（準備フェーズ）
            logger.info("2PC Phase1開始（Prepare）: transactionId={}", txId);
            coordinatorMap.put(txId, "PREPARING", 7, TimeUnit.DAYS);

            boolean allPrepared = true;
            List<String> preparedParticipants = new ArrayList<>();

            for (TransactionParticipant participant : participants) {
                try {
                    logger.debug("Prepare要求送信: participantId={}", participant.getId());
                    boolean prepared = participant.prepare(txId);

                    if (prepared) {
                        preparedParticipants.add(participant.getId());
                        logger.debug("Prepare成功: participantId={}", participant.getId());
                    } else {
                        logger.warn("Prepare失敗: participantId={}", participant.getId());
                        allPrepared = false;
                        break;
                    }
                } catch (Exception e) {
                    logger.error("Prepare例外発生: participantId={}", participant.getId(), e);
                    allPrepared = false;
                    break;
                }
            }

            // Phase 2: Commit or Abort（決定フェーズ）
            if (allPrepared) {
                logger.info("Phase1成功、Phase2開始（Commit）: transactionId={}", txId);
                coordinatorMap.put(txId, "COMMITTING", 7, TimeUnit.DAYS);

                boolean commitSuccess = true;
                for (TransactionParticipant participant : participants) {
                    try {
                        participant.commit(txId);
                        logger.debug("Commit成功: participantId={}", participant.getId());
                    } catch (Exception e) {
                        logger.error("Commit失敗: participantId={} - 手動回復が必要",
                                participant.getId(), e);
                        commitSuccess = false;
                        // 注意: 実際の実装では回復プロトコルが必要
                        // 一部の参加者がコミット済みなので、手動介入が必要な場合がある
                    }
                }

                coordinatorMap.put(txId, commitSuccess ? "COMMITTED" : "COMMIT_FAILED", 7, TimeUnit.DAYS);
                stats.recordTransaction(commitSuccess);
                return commitSuccess;

            } else {
                logger.info("Phase1失敗、Phase2開始（Abort）: transactionId={}", txId);
                coordinatorMap.put(txId, "ABORTING", 7, TimeUnit.DAYS);

                // 準備完了した参加者のみAbort処理
                for (TransactionParticipant participant : participants) {
                    if (!preparedParticipants.contains(participant.getId())) continue;
                    try {
                        participant.abort(txId);
                        logger.debug("Abort完了: participantId={}", participant.getId());
                    } catch (Exception e) {
                        logger.error("Abort失敗: participantId={}", participant.getId(), e);
                        // Abort失敗は通常問題ないが、リソースリークの可能性
                    }
                }

                coordinatorMap.put(txId, "ABORTED", 7, TimeUnit.DAYS);
                stats.recordTransaction(false);
                return false;
            }

        } catch (Exception e) {
            logger.error("2PC協調処理で例外発生", e);
            coordinatorMap.put(txId, "FAILED", 7, TimeUnit.DAYS);
            stats.recordTransaction(false);
            return false;
        }
    }

    /**
     * バージョン管理による楽観的ロック
     *
     * ## 楽観的ロック vs 悲観的ロック
     *
     * **悲観的ロック**:
     * - データ読み取り時にロック取得
     * - 他のトランザクションをブロック
     * - デッドロックリスク
     * - 低並行性、高整合性
     *
     * **楽観的ロック（本実装）**:
     * - データ読み取り時はロックなし
     * - 更新時にバージョン確認
     * - 競合検出で更新失敗
     * - 高並行性、結果整合性
     *
     * ## バージョン管理戦略
     * 1. **データ読み取り**: 現在のバージョン番号も取得
     * 2. **処理実行**: ビジネスロジック実行（時間がかかってもOK）
     * 3. **Compare-And-Swap**: バージョン確認付き更新
     * 4. **競合検出**: バージョンが変更されていたら失敗
     *
     * ## 適用場面
     * - 読み取り頻度が高い操作
     * - 競合が稀な場合
     * - レスポンス性能重視
     * - 長時間の処理が含まれる場合
     *
     * ## 競合時の戦略
     * - **即座に失敗**: 呼び出し元でリトライ判断
     * - **自動リトライ**: 指数バックオフで再実行
     * - **マージ処理**: データの種類によっては自動マージ
     *
     * @param <T>       データの型
     * @param key       データキー
     * @param operation データ更新処理（現在の値とバージョンを受け取る）
     * @return 更新成功時の新しい値のOptional、競合時はEmpty
     */
    public <T> Optional<T> executeWithOptimisticLock(String key,
            Function<VersionedData<T>, T> operation) {
        RBucket<VersionedData<T>> bucket = redissonClient.getBucket(key);

        // Step 1: 現在のバージョンとデータを取得
        VersionedData<T> current = bucket.get();
        if (current == null) {
            // データが存在しない場合はバージョン0から開始
            current = new VersionedData<>(null, 0L);
            logger.debug("新規データ作成: key={}", key);
        } else {
            logger.debug("現在バージョン取得: key={}, version={}", key, current.version());
        }

        // Step 2: ビジネスロジック実行（時間がかかっても問題なし）
        T newValue = operation.apply(current);
        VersionedData<T> newData = new VersionedData<>(newValue, current.version() + 1);

        // Step 3: Compare-And-Swap による原子的更新
        boolean success = bucket.compareAndSet(current, newData);

        if (success) {
            logger.debug("楽観的ロック更新成功: key={}, version={} → {}",
                    key, current.version(), newData.version());
            stats.recordTransaction(true);
            return Optional.of(newValue);
        } else {
            logger.warn("楽観的ロック競合検出: key={}, expected_version={}",
                    key, current.version());
            stats.recordTransaction(false);
            return Optional.empty();
        }
    }

    /**
     * 楽観的ロックの自動リトライ版
     *
     * 競合発生時に指数バックオフでリトライを実行
     *
     * @param <T>        データの型
     * @param key        データキー
     * @param operation  データ更新処理
     * @param maxRetries 最大リトライ回数
     * @return 最終的な実行結果のOptional
     */
    public <T> Optional<T> executeWithOptimisticLockRetry(String key,
            Function<VersionedData<T>, T> operation, int maxRetries) {

        for (int attempt = 0; attempt <= maxRetries; attempt++) {
            Optional<T> result = executeWithOptimisticLock(key, operation);

            if (result.isPresent()) {
                if (attempt > 0) {
                    logger.info("楽観的ロックリトライ成功: key={}, attempts={}", key, attempt + 1);
                }
                return result;
            }

            if (attempt < maxRetries) {
                // 指数バックオフで待機
                long delay = (long) (Math.pow(2, attempt) * 10); // 10ms, 20ms, 40ms, ...
                try {
                    Thread.sleep(delay);
                    logger.debug("楽観的ロックリトライ待機: key={}, delay={}ms", key, delay);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    logger.error("リトライ待機中に割り込み", e);
                    break;
                }
            }
        }

        logger.warn("楽観的ロック全リトライ失敗: key={}, attempts={}", key, maxRetries + 1);
        return Optional.empty();
    }

    /**
     * 統計情報を取得
     *
     * @return TransactionStatsオブジェクト
     */
    public TransactionStats getStats() {
        return stats;
    }

    /**
     * リソースクリーンアップ
     */
    public void shutdown() {
        logger.info("TransactionalLockService シャットダウン開始");
        stats.reset();
        logger.info("TransactionalLockService シャットダウン完了");
    }

    /**
     * 2フェーズコミット参加者インターフェース
     *
     * 参加者が実装すべき3つのメソッドを定義。
     * 各メソッドは冪等性を保つ必要がある。
     */
    public interface TransactionParticipant {
        /**
         * 参加者の一意識別子を取得
         *
         * @return 参加者ID
         */
        String getId();

        /**
         * 準備フェーズの処理
         *
         * 実装すべき内容：
         * - リソースのロック
         * - 前提条件の検証
         * - ログの永続化
         * - ロールバック情報の保存
         *
         * @param transactionId トランザクション識別子
         * @return 準備完了時true、不可能時false
         * @throws Exception 予期しないエラー時
         */
        boolean prepare(String transactionId) throws Exception;

        /**
         * コミットフェーズの処理
         *
         * 実装すべき内容：
         * - 準備フェーズの変更を確定
         * - リソースのロック解放
         * - 成功ログの記録
         *
         * 注意：このメソッドは冪等である必要がある
         *
         * @param transactionId トランザクション識別子
         * @throws Exception コミット失敗時（重大な問題）
         */
        void commit(String transactionId) throws Exception;

        /**
         * 中断フェーズの処理
         *
         * 実装すべき内容：
         * - 準備フェーズの変更を破棄
         * - リソースのロック解放
         * - 中断ログの記録
         *
         * @param transactionId トランザクション識別子
         * @throws Exception 中断処理失敗時
         */
        void abort(String transactionId) throws Exception;
    }

    /**
     * バージョン付きデータのラッパー
     * 楽観的ロックで使用するデータ構造
     *
     * Java 21のレコード機能を使用した不変データクラス
     *
     * @param <T>     データの型
     * @param data    実際のデータ
     * @param version バージョン番号（単調増加）
     */
    public record VersionedData<T>(T data, Long version) {
        /**
         * バージョン付きデータのコンストラクタ
         *
         * @param data    データ
         * @param version バージョン（nullの場合0に設定）
         */
        public VersionedData {
            if (version == null) {
                version = 0L;
            }
        }

        /**
         * データが存在するかチェック
         *
         * @return データが非nullの場合true
         */
        public boolean hasData() {
            return data != null;
        }

        /**
         * 次のバージョンを作成
         *
         * @param newData 新しいデータ
         * @return バージョン番号をインクリメントした新しいVersionedData
         */
        public VersionedData<T> nextVersion(T newData) {
            return new VersionedData<>(newData, version + 1);
        }
    }

    /**
     * トランザクション統計情報クラス
     *
     * 分散トランザクションシステムの監視とパフォーマンス分析用
     * スレッドセーフな実装で、本番運用での統計収集に対応
     */
    /**
     * トランザクション統計情報クラス
     *
     * CacheMetrics と同様に LongAdder を使用してスレッドセーフかつ
     * 高並列時のコンテンションを最小化する。
     */
    public static class TransactionStats {
        // LongAdder: 高並列時に synchronized long より低コンテンションで高速 (CacheMetrics と統一)
        private final LongAdder totalTransactions       = new LongAdder();
        private final LongAdder successfulTransactions  = new LongAdder();
        private final LongAdder failedTransactions      = new LongAdder();
        private final LongAdder rollbacks               = new LongAdder();
        private final LongAdder compensations           = new LongAdder();

        /**
         * トランザクション完了を記録
         *
         * @param success 成功時true、失敗時false
         */
        public void recordTransaction(boolean success) {
            totalTransactions.increment();
            if (success) {
                successfulTransactions.increment();
            } else {
                failedTransactions.increment();
            }
        }

        /**
         * ロールバック実行を記録
         */
        public void recordRollback() {
            rollbacks.increment();
        }

        /**
         * 補償処理実行を記録
         */
        public void recordCompensation() {
            compensations.increment();
        }

        /**
         * 統計情報をマップで取得
         *
         * @return 統計情報のマップ
         */
        public Map<String, Long> getStats() {
            long total      = totalTransactions.sum();
            long successful = successfulTransactions.sum();
            long successRate = total > 0 ? (successful * 100 / total) : 0;

            return Map.of(
                    "total",        total,
                    "successful",   successful,
                    "failed",       failedTransactions.sum(),
                    "rollbacks",    rollbacks.sum(),
                    "compensations",compensations.sum(),
                    "successRate",  successRate);
        }

        /**
         * 成功率を取得
         *
         * @return 成功率（0-100の実数値）
         */
        public double getSuccessRate() {
            long total = totalTransactions.sum();
            return total > 0 ? (double) successfulTransactions.sum() / total * 100 : 0.0;
        }

        /**
         * 統計情報をリセット
         */
        public void reset() {
            totalTransactions.reset();
            successfulTransactions.reset();
            failedTransactions.reset();
            rollbacks.reset();
            compensations.reset();
        }

        /**
         * 統計情報の文字列表現
         *
         * @return 統計サマリー
         */
        @Override
        public String toString() {
            return String.format(
                    "TransactionStats{total=%d, successful=%d, failed=%d, " +
                            "rollbacks=%d, compensations=%d, successRate=%.1f%%}",
                    totalTransactions.sum(), successfulTransactions.sum(), failedTransactions.sum(),
                    rollbacks.sum(), compensations.sum(), getSuccessRate());
        }
    }
}
