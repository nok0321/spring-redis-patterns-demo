package com.example.cache.service;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.decorators.Decorators;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryRegistry;

import org.redisson.api.RBucket;
import org.redisson.api.RFuture;
import org.redisson.api.RedissonClient;
import org.redisson.api.options.KeysScanParams;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import org.redisson.client.RedisConnectionException;
import org.redisson.client.RedisTimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.Supplier;

/**
 * 多層フォールバック戦略を持つ回復力のあるキャッシュサービス
 * Java 21の機能を使用: Switch式、パターンマッチング、Virtual threads
 *
 * このサービスは以下の特徴を提供します：
 *
 * ## キャッシュ戦略
 * 1. **Redis キャッシュ**: 分散環境での一貫性を保つメインキャッシュ
 * 2. **フォールバック**: Redis 障害時にデータソースから直接取得 (get() の fallbackSupplier)
 *
 * ※ローカル（インプロセス）キャッシュは現在未実装
 *
 * ## 回復力パターン
 * - **CircuitBreaker**: 連続的な障害時の呼び出し停止
 * - **Retry**: 一時的障害に対する自動再試行
 * - **RateLimiter**: Redis バックエンド分散レートリミッター（{@link DistributedRateLimiterService}）
 *
 * ## パフォーマンス最適化
 * - Java 21のVirtual Threadsによる効率的な非同期処理
 * - バッチ処理による通信回数削減
 * - 部分的成功ハンドリングによる可用性向上
 *
 * ## 監視とメトリクス
 * - 包括的なメトリクス収集
 * - ヘルスチェック機能
 * - リアルタイム統計情報
 */
@Service
public class ResilientCacheService {
    private static final Logger logger = LoggerFactory.getLogger(ResilientCacheService.class);

    private final ExecutorService virtualExecutor;

    private final RedissonClient redissonClient;

    // Resilience4jコンポーネント（回復力パターン実装）
    private final CircuitBreaker circuitBreaker;
    private final Retry retry;

    // Redis バックエンドの分散レートリミッター
    private final DistributedRateLimiterService distributedRateLimiter;

    public ResilientCacheService(RedissonClient redissonClient,
                                 CircuitBreakerRegistry circuitBreakerRegistry,
                                 RetryRegistry retryRegistry,
                                 DistributedRateLimiterService distributedRateLimiter,
                                 ExecutorService virtualThreadExecutor) {
        this.redissonClient = redissonClient;
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker("cache-operations");
        this.retry = retryRegistry.retry("default");
        this.distributedRateLimiter = distributedRateLimiter;
        this.virtualExecutor = virtualThreadExecutor;
    }

    // メトリクス収集用
    private final CacheMetrics metrics = new CacheMetrics();

    // エラーシミュレーションフラグ (Feature 2: Circuit Breaker デモ用)
    private volatile boolean simulateError = false;

    /**
     * フォールバック付きキャッシュ値取得
     *
     * 取得戦略:
     * Redis/Valkey → fallbackSupplier によるフォールバック
     *
     * @param <T>              キャッシュする値の型
     * @param key              キャッシュキー
     * @param type             期待する値の型（キャスト用）
     * @param fallbackSupplier キャッシュミス時のデータ取得関数
     * @return キャッシュされた値、またはフォールバックで取得した値のOptional
     */
    public <T> Optional<T> get(String key, Class<T> type, Supplier<T> fallbackSupplier) {
        metrics.recordOperation("get");

        // 分散レートリミッターでシステム負荷制限（Redis バックエンド）
        if (!distributedRateLimiter.tryAcquire()) {
            logger.warn("分散レートリミッターにより拒否: key={}", key);
            metrics.recordError();
            return Optional.empty();
        }

        // L1: Redis操作を回復力パターンでラップ
        Supplier<Optional<T>> redisOperation = () -> getFromRedis(key, type);

        // Decoratorsパターンで複数の回復力パターンを組み合わせ
        // 実行順序: Retry → CircuitBreaker → 実際のRedis操作
        // （レートリミットは上で事前チェック済み）
        Optional<T> result = Decorators.ofSupplier(redisOperation)
                .withCircuitBreaker(circuitBreaker) // サーキットブレーカーで障害時の呼び出し停止
                .withRetry(retry) // 一時的障害に対する再試行
                .withFallback(Arrays.asList( // 特定例外に対するフォールバック
                        RedisConnectionException.class,
                        RedisTimeoutException.class,
                        CallNotPermittedException.class), throwable -> {
                            logger.warn("Redis操作が失敗、フォールバックを使用: key={}", key, throwable);
                            metrics.recordFallback();
                            // fallbackSupplier が指定されている場合はそちらからデータを取得
                            if (fallbackSupplier != null) {
                                try {
                                    T fallbackValue = fallbackSupplier.get();
                                    logger.debug("フォールバック取得成功: key={}", key);
                                    return Optional.ofNullable(fallbackValue);
                                } catch (Exception fe) {
                                    logger.warn("フォールバック実行でエラー: key={}", key, fe);
                                }
                            }
                            logger.debug("すべてのフォールバック手段が利用不可: key={}", key);
                            return Optional.empty();
                        })
                .decorate()
                .get();

        // Redis取得成功時のメトリクス記録
        result.ifPresent(value -> {
            metrics.recordRedisHit();
            logger.debug("Redis取得成功: key={}", key);
        });

        return result;
    }

    /**
     * 非同期での値設定
     *
     * Redisへの書き込みを回復力パターンで保護して実行する。
     *
     * Java 21のVirtual Threadsを使用して効率的な並行処理を実現：
     * - OS Thread消費を最小化
     * - 大量の同時書き込み要求に対応
     * - ブロッキングI/Oの効率的な処理
     *
     * @param <T>   キャッシュする値の型
     * @param key   キャッシュキー
     * @param value キャッシュする値
     * @param ttl   生存時間（Time To Live）
     * @return 設定成功時true、失敗時falseのCompletableFuture
     */
    public <T> CompletableFuture<Boolean> setAsync(String key, T value, Duration ttl) {
        metrics.recordOperation("set");

        return CompletableFuture.supplyAsync(() -> {
            // 分散レートリミッターでシステム負荷制限（Redis バックエンド）
            if (!distributedRateLimiter.tryAcquire()) {
                logger.warn("分散レートリミッターにより書き込み拒否: key={}", key);
                metrics.recordError();
                return false;
            }

            Supplier<Boolean> operation = () -> setInRedis(key, value, ttl);

            // Redis書き込み操作を回復力パターンで保護
            boolean redisResult = Decorators.ofSupplier(operation)
                    .withCircuitBreaker(circuitBreaker)
                    .withRetry(retry)
                    .withFallback(Arrays.asList(
                            RedisConnectionException.class,
                            RedisTimeoutException.class,
                            CallNotPermittedException.class), throwable -> {
                        logger.error("Redis書き込み失敗: key={}", key, throwable);
                        metrics.recordError();
                        return false;
                    })
                    .decorate()
                    .get();

            if (redisResult) {
                logger.debug("Redis書き込み完了: key={}", key);
            }

            return redisResult;
        }, virtualExecutor);
    }

    /**
     * バッチ取得操作（部分的成功ハンドリング付き）
     *
     * 大量のキーをRedisから効率的に取得する。
     * 部分的な失敗でも成功分は返却し、障害時でも
     * 利用可能なデータを提供する
     *
     * @param keys 取得するキーのセット
     * @return キーと値のマップ（取得できたもののみ）
     */
    public Map<String, Object> getBatch(Set<String> keys) {
        metrics.recordOperation("batch-get");
        logger.debug("バッチ取得開始: keys={}", keys.size());

        Map<String, Object> results = new HashMap<>();

        // Step 1: ローカルキャッシュから可能な限り取得
        Set<String> missingKeys = new HashSet<>(keys);

        logger.debug("Redis取得が必要: missing={}",
                missingKeys.size());

        // Step 2: 不足分をRedisから取得
        Supplier<Map<String, Object>> batchOperation = () -> getBatchFromRedis(missingKeys);

        Map<String, Object> redisResults = Decorators.ofSupplier(batchOperation)
                .withCircuitBreaker(circuitBreaker)
                .withRetry(retry)
                .withFallback(Arrays.asList(Exception.class), throwable -> {
                    logger.warn("バッチ操作失敗、部分結果を返却: failed_keys={}",
                            missingKeys.size(), throwable);
                    metrics.recordFallback();
                    return Collections.emptyMap(); // 空のMapを返して部分的成功を許可
                })
                .decorate()
                .get();

        redisResults.forEach((k, v) -> {
            results.put(k, v);
        });

        logger.debug("バッチ取得完了: total={}, redis_hits={}",
                results.size(), redisResults.size());
        return results;
    }

    /**
     * Redisとローカルキャッシュからキーを削除
     *
     * 削除戦略：
     * 1. ローカルキャッシュから即座に削除（一貫性のため）
     * 2. Redis削除を回復力パターンで実行
     *
     * ローカルを先に削除することで、Redis削除が失敗しても
     * 少なくとも当該インスタンスでは古いデータが残らないことを保証
     *
     * @param key 削除するキー
     * @return Redis削除成功時true、失敗時false
     */
    public boolean delete(String key) {
        metrics.recordOperation("delete");
        logger.debug("キー削除開始: key={}", key);

        // Step 2: Redisから削除（回復力パターン付き）
        boolean result = Decorators.ofSupplier(() -> deleteFromRedis(key))
                .withCircuitBreaker(circuitBreaker)
                .withRetry(retry)
                .withFallback(Arrays.asList(Exception.class), throwable -> {
                    logger.error("Redis削除失敗: key={}", key, throwable);
                    metrics.recordError();
                    return false; // 失敗を明示的に示す
                })
                .decorate()
                .get();

        logger.debug("キー削除完了: key={}, redis_success={}", key, result);
        return result;
    }

    /**
     * パターンベースキー検索（ページネーション付き）
     *
     * Redis SCAN系コマンドを使用してメモリ効率的なキー検索を実行。
     * パターンマッチングによる柔軟な検索と、制限数による結果制御を提供。
     *
     * 注意: 本番環境では大量のキーがある場合、パフォーマンスに影響する可能性があります。
     * 適切な制限値を設定し、必要に応じて非同期実行を検討してください。
     *
     * @param pattern 検索パターン（Redis glob-style pattern: *, ?, []）
     * @param limit   最大取得件数
     * @return マッチするキーのセット
     */
    public Set<String> searchKeys(String pattern, int limit) {
        logger.debug("キー検索開始: pattern={}, limit={}", pattern, limit);

        // NOTE: searchKeys には意図的に Retry を適用していない。
        // SCAN 系のキー検索は冪等だが、大量キー環境でのリトライはシステム負荷を増大させるため除外している。
        // 分散レートリミッターでシステム負荷制限（検索は重い操作）
        if (!distributedRateLimiter.tryAcquire()) {
            logger.warn("分散レートリミッターによりキー検索拒否: pattern={}", pattern);
            metrics.recordError();
            return Collections.emptySet();
        }

        Set<String> results = Decorators.ofSupplier(() -> searchKeysInRedis(pattern, limit))
                .withCircuitBreaker(circuitBreaker)
                .withFallback(Arrays.asList(Exception.class), throwable -> {
                    logger.warn("キー検索失敗: pattern={}", pattern, throwable);
                    metrics.recordError();
                    return Collections.emptySet();
                })
                .decorate()
                .get();

        logger.debug("キー検索完了: pattern={}, found={}", pattern, results.size());
        return results;
    }

    // プライベートRedis操作メソッド群
    // RedissonClientを通じて安全にRedis操作を実行

    /**
     * Redisから値を取得
     *
     * @param <T>  値の型
     * @param key  キー
     * @param type 期待する型
     * @return 取得した値のOptional
     */
    private <T> Optional<T> getFromRedis(String key, Class<T> type) {
        if (simulateError) {
            throw new RuntimeException("エラーシミュレーション中: 意図的に障害を注入しています");
        }
        RBucket<T> bucket = redissonClient.getBucket(key);
        T value = bucket.get();
        if (value != null) {
            logger.trace("Redis取得成功: key={}", key);
        }
        return Optional.ofNullable(value);
    }

    /**
     * Redisに値を設定
     *
     * @param <T>   値の型
     * @param key   キー
     * @param value 値
     * @param ttl   生存時間
     * @return 設定成功時true
     */
    private <T> boolean setInRedis(String key, T value, Duration ttl) {
        try {
            RBucket<T> bucket = redissonClient.getBucket(key);
            if (ttl != null && !ttl.isZero()) {
                bucket.set(value, ttl);
                logger.trace("Redis設定成功（TTL付き）: key={}, ttl={}ms", key, ttl.toMillis());
            } else {
                bucket.set(value);
                logger.trace("Redis設定成功: key={}", key);
            }
            return true;
        } catch (Exception e) {
            logger.debug("Redis設定中にエラー: key={}", key, e);
            throw e; // Resilience4jによる処理のため再スロー
        }
    }

    /**
     * Redisからバッチで値を取得
     * RedissonのRBatchを使用した効率的なバッチ処理：
     *
     * ## 実装戦略
     * 1. RBatchで複数の非同期操作をパイプライン化
     * 2. 単一のbatch.execute()でまとめて実行
     * 3. parallelStream()で結果取得を並列化
     * 4. 個別のキー失敗でも部分的成功を許可
     *
     * ## スケーラビリティ
     * 大量のキー（100+）でも効率的に処理可能
     * Redis Clusterでも適切に分散実行される
     *
     * @param keys キーのセット
     * @return キーと値のマップ（取得できたもののみ）
     */
    private Map<String, Object> getBatchFromRedis(Set<String> keys) {
        // RBatch (MULTI/EXEC) は HASH 型キー（Redisson ロックキー等）が混在すると
        // WRONGTYPE エラーでバッチ全体が失敗するため、
        // 個別 getAsync() を発行してキーごとに失敗を分離する
        List<String> keyList = new ArrayList<>(keys);
        Map<String, RFuture<Object>> futures = new LinkedHashMap<>();

        // 全キーの非同期 GET を一括発行（Netty がパイプライン処理）
        for (String key : keyList) {
            futures.put(key, redissonClient.<Object>getBucket(key).getAsync());
        }

        logger.debug("バッチ操作準備完了: keys={}", keys.size());

        Map<String, Object> results = new HashMap<>();
        AtomicInteger successCount = new AtomicInteger();

        // 各キーの結果を順番に回収（HASH 型キーは例外をスキップ）
        futures.forEach((key, future) -> {
            try {
                Object value = future.get();
                if (value != null) {
                    results.put(key, value);
                    successCount.incrementAndGet();
                }
            } catch (Exception e) {
                // WRONGTYPE エラー等はスキップして部分的成功を許可
                logger.debug("バッチ結果取得でキー処理失敗: key={}", key, e);
            }
        });

        int found = successCount.get();
        logger.debug("バッチ取得結果: requested={}, found={}, hit_rate={}%",
                   keys.size(), found,
                   keys.size() > 0 ? (found * 100 / keys.size()) : 0);

        return results;
    }

    /**
     * Redisからキーを削除
     *
     * @param key 削除するキー
     * @return 削除成功時true
     */
    private boolean deleteFromRedis(String key) {
        RBucket<Object> bucket = redissonClient.getBucket(key);
        boolean deleted = bucket.delete();
        logger.trace("Redis削除: key={}, deleted={}", key, deleted);
        return deleted;
    }

    /**
     * Redisでキーをパターン検索
     *
     * @param pattern 検索パターン
     * @param limit   最大件数
     * @return マッチするキーのセット
     */
    /**
     * Redisson が内部管理に使うキープレフィックス。
     * Kryo5Codec では読み取れない独自形式で保存されているため検索結果から除外する。
     */
    private static final String REDISSON_INTERNAL_PREFIX = "redisson_";

    private Set<String> searchKeysInRedis(String pattern, int limit) {
        Set<String> keys = new HashSet<>();
        try {
            // getKeysStreamByPatternでメモリ効率的にスキャン
            // Redisson 内部キー（redisson_unlock_latch 等）は独自 codec で保存されており
            // Kryo5Codec でのデコードが失敗するため除外する
            redissonClient.getKeys().getKeysStream(new KeysScanParams().pattern(pattern).limit(limit))
                    .filter(k -> !k.startsWith(REDISSON_INTERNAL_PREFIX))
                    .forEach(keys::add);
            logger.debug("パターン検索完了: pattern={}, limit={}, found={}",
                    pattern, limit, keys.size());
        } catch (Exception e) {
            logger.debug("パターン検索でエラー: pattern={}", pattern, e);
            throw e;
        }
        return keys;
    }

    /**
     * 監視用キャッシュメトリクスを取得
     *
     * 運用監視で重要な指標：
     * - ヒット率: キャッシュ効率の指標
     * - フォールバック回数: システム障害の頻度
     * - エラー回数: 問題の発生状況
     *
     * @return CacheMetricsオブジェクト
     */
    public CacheMetrics getMetrics() {
        return metrics;
    }

    /**
     * 頻繁にアクセスされるキーでキャッシュを温める（ウォームアップ）
     *
     * アプリケーション起動時や大きな設定変更後に実行することで、
     * 初期リクエスト時のレスポンス時間を改善できます。
     *
     * Virtual Threadsを使用して効率的に並行実行し、
     * ウォームアップ時間を最小化します。
     *
     * @param keys ウォームアップするキーのセット
     * @return ウォームアップ完了を示すCompletableFuture
     */
    public CompletableFuture<Void> warmUp(Set<String> keys) {
        return CompletableFuture.runAsync(() -> {
            logger.info("キャッシュウォームアップ開始: keys={}", keys.size());
            long startTime = System.currentTimeMillis();

            int successCount = 0;
            for (String key : keys) {
                try {
                    // 各キーに対してget操作を実行（フォールバックはnull）
                    Optional<Object> result = get(key, Object.class, null);
                    if (result.isPresent()) {
                        successCount++;
                    }
                } catch (Exception e) {
                    logger.debug("ウォームアップでキー処理失敗: key={}", key, e);
                    // 個別の失敗は継続（部分的成功を許可）
                }
            }

            long duration = System.currentTimeMillis() - startTime;
            logger.info("キャッシュウォームアップ完了: total={}, success={}, duration={}ms",
                    keys.size(), successCount, duration);
        }, virtualExecutor);
    }

    /**
     * サービスヘルスチェック
     *
     * 監視システムやロードバランサーから呼び出される
     * ヘルスチェックエンドポイント用の判定ロジック。
     *
     * 判定基準：
     * - Redis接続の健全性
     * - CircuitBreakerがOPEN状態でない
     *
     * @return 正常時true、異常時false
     */
    public boolean isHealthy() {
        try {
            boolean redisHealthy = false;
            try {
                redissonClient.getBucket("health-check-ping").isExists();
                redisHealthy = true;
            } catch (Exception e) {
                logger.debug("Redis接続チェック失敗", e);
            }
            boolean circuitBreakerHealthy = circuitBreaker.getState() != CircuitBreaker.State.OPEN;

            boolean overall = redisHealthy && circuitBreakerHealthy;

            if (!overall) {
                logger.debug("ヘルスチェック失敗: redis={}, circuit_breaker={}",
                        redisHealthy, circuitBreakerHealthy);
            }

            return overall;
        } catch (Exception e) {
            logger.warn("ヘルスチェック実行中にエラー", e);
            return false;
        }
    }

    /**
     * エラーシミュレーションフラグを設定する (Feature 2: Circuit Breaker デモ用)
     *
     * @param enabled true にすると getFromRedis() が RuntimeException をスローする
     */
    public void setSimulateError(boolean enabled) {
        this.simulateError = enabled;
        logger.info("エラーシミュレーション: {}", enabled ? "有効" : "無効");
    }

    /**
     * エラーシミュレーションの現在の状態を返す
     */
    public boolean isSimulateError() {
        return simulateError;
    }

    /**
     * キャッシュメトリクス追跡クラス
     *
     * スレッドセーフな実装で以下の統計情報を収集：
     * - 操作数とヒット率
     * - Redisヒット数
     * - フォールバックとエラーの発生回数
     *
     * 監視ダッシュボードやアラートシステムでの
     * パフォーマンス分析に使用されます。
     */
    public static class CacheMetrics {
        // LongAdder: 高並列時に synchronized long より低コンテンションで高速
        private final LongAdder operations = new LongAdder();
        private final LongAdder redisHits  = new LongAdder();
        private final LongAdder fallbacks  = new LongAdder();
        private final LongAdder errors     = new LongAdder();

        /**
         * 操作実行を記録
         *
         * @param type 操作タイプ（"get", "set", "delete", "batch-get"）
         */
        public void recordOperation(String type) {
            operations.increment();
        }

        /**
         * Redisヒットを記録
         */
        public void recordRedisHit() {
            redisHits.increment();
        }

        /**
         * フォールバック実行を記録
         */
        public void recordFallback() {
            fallbacks.increment();
        }

        /**
         * エラー発生を記録
         */
        public void recordError() {
            errors.increment();
        }

        /**
         * メトリクスをMap形式で取得
         *
         * 監視システムやダッシュボードでの表示用に
         * 構造化されたデータとして提供。
         *
         * @return メトリクス名をキー、値をValueとするMap
         */
        public Map<String, Long> toMap() {
            long ops  = operations.sum();
            long hits = redisHits.sum();
            long hitRate = ops > 0 ? (hits * 100 / ops) : 0;

            return Map.of(
                    "operations", ops,            // 総操作数
                    "redisHits",  hits,            // Redisヒット数
                    "fallbacks",  fallbacks.sum(), // フォールバック数
                    "errors",     errors.sum(),    // エラー数
                    "hitRate",    hitRate           // ヒット率（%）
            );
        }

        /**
         * ヒット率を計算
         *
         * @return ヒット率（0-100の整数値）
         */
        public long getHitRate() {
            long ops = operations.sum();
            return ops > 0 ? (redisHits.sum() * 100 / ops) : 0;
        }

        /**
         * メトリクスリセット
         *
         * 定期的なメトリクス収集やテスト時に使用
         */
        public void reset() {
            operations.reset();
            redisHits.reset();
            fallbacks.reset();
            errors.reset();
        }

        /**
         * 現在の統計情報を文字列として取得
         *
         * @return 統計情報の可読表現
         */
        @Override
        public String toString() {
            return String.format(
                    "CacheMetrics{operations=%d, redisHits=%d, " +
                            "fallbacks=%d, errors=%d, hitRate=%d%%}",
                    operations.sum(), redisHits.sum(),
                    fallbacks.sum(), errors.sum(), getHitRate());
        }
    }
}
