package com.example.cache.config;

import io.github.resilience4j.common.retry.configuration.RetryConfigCustomizer;
import io.github.resilience4j.retry.RetryConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ResilienceRetryConfig {

    /**
     * retryOnResult はキャッシュミス (Optional.empty()) をリトライ対象にしないよう明示的に無効化。
     * リトライは例外発生時のみ application.yml の retry-exceptions 設定に従って行われる。
     */
    @Bean
    @SuppressWarnings("unchecked") // RetryConfigCustomizer passes raw Builder; retryOnResult(Object) is type-safe
    public RetryConfigCustomizer retryOnResultCustomizer() {
        return RetryConfigCustomizer.of("default", builder ->
                builder.retryOnResult(result -> false)
        );
    }
}
