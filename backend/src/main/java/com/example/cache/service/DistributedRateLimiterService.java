package com.example.cache.service;

import org.redisson.api.RRateLimiter;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Redis 分散レートリミッターサービス
 *
 * Redisson の {@link RRateLimiter} を使用して Redis バックエンドの分散レートリミットを提供する。
 * インプロセスの Resilience4j RateLimiter とは異なり、複数インスタンス間で
 * レート制限を共有できるため、本番のマルチポッド環境に適している。
 *
 * ## フェイルオープン設計
 * Redis が応答しない場合はリクエストを通過させる（フェイルオープン）。
 * 可用性を優先し、レートリミットの障害がサービス全体の障害につながらないようにする。
 *
 * ## 設定
 * - ratelimiter.rate: 許可レート（デフォルト 100）
 * - ratelimiter.interval: レートインターバル（秒単位、デフォルト 1）
 */
@Service
public class DistributedRateLimiterService {

    private static final Logger logger = LoggerFactory.getLogger(DistributedRateLimiterService.class);

    private final RRateLimiter rateLimiter;

    public DistributedRateLimiterService(RedissonClient redissonClient,
            @Value("${ratelimiter.rate:100}") long rate,
            @Value("${ratelimiter.interval:1}") long interval) {
        this.rateLimiter = redissonClient.getRateLimiter("cache-operations");
        try {
            this.rateLimiter.trySetRate(RateType.OVERALL, rate, Duration.ofSeconds(interval));
            logger.info("分散レートリミッター初期化完了: rate={}/{}s", rate, interval);
        } catch (Exception e) {
            logger.warn("分散レートリミッター初期化失敗（Redis未接続の可能性）: {}", e.getMessage());
        }
    }

    /**
     * パーミットの取得を試みる
     *
     * Redis が利用不可の場合はフェイルオープンで {@code true} を返す。
     *
     * @return パーミット取得成功時 {@code true}、レート超過時 {@code false}
     */
    public boolean tryAcquire() {
        try {
            return rateLimiter.tryAcquire();
        } catch (Exception e) {
            // フェイルオープン: Redis が利用不可の場合はリクエストを通過させる
            logger.debug("分散レートリミッター取得中にエラー、フェイルオープンで通過: {}", e.getMessage());
            return true;
        }
    }

    /**
     * レートリミッターの現在の状態を返す
     */
    public record Status(long availablePermits, long rate, long intervalMs) {}

    public Status getStatus() {
        try {
            var config = rateLimiter.getConfig();
            long available = rateLimiter.availablePermits();
            return new Status(available, config.getRate(), config.getRateInterval());
        } catch (Exception e) {
            logger.debug("分散レートリミッターステータス取得中にエラー: {}", e.getMessage());
            return new Status(-1L, -1L, -1L);
        }
    }
}
