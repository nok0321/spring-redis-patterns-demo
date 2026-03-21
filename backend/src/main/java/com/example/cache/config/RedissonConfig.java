package com.example.cache.config;

import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.config.ConstantDelay;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.concurrent.Executors;

@Configuration
public class RedissonConfig {

    @Value("${REDIS_HOST:redis}")
    private String redisHost;

    @Value("${REDIS_PORT:6379}")
    private int redisPort;

    @Value("${REDIS_PASSWORD:}")
    private String redisPassword;

    @Bean(destroyMethod = "shutdown")
    public RedissonClient redissonClient() {
        Config config = new Config();
        config.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        config.setTcpKeepAlive(true);
        config.setTcpNoDelay(true);

        config.useSingleServer()
                .setAddress("redis://" + redisHost + ":" + redisPort)
                .setConnectionPoolSize(32)
                .setConnectionMinimumIdleSize(8)
                .setIdleConnectionTimeout(30000)
                .setConnectTimeout(10000)
                .setTimeout(5000)
                .setRetryAttempts(3)
                .setRetryDelay(new ConstantDelay(Duration.ofMillis(1500)))
                .setPingConnectionInterval(30000);

        if (!redisPassword.isBlank()) {
            config.setPassword(redisPassword);
        }

        return Redisson.create(config);
    }
}
