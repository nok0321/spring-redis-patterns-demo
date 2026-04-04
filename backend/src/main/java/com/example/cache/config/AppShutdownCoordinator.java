package com.example.cache.config;

import com.example.cache.service.DistributedLockService;
import com.example.cache.service.TransactionalLockService;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

@Component
@DependsOn("redissonClient")
public class AppShutdownCoordinator {

    private static final Logger logger = LoggerFactory.getLogger(AppShutdownCoordinator.class);

    private final DistributedLockService lockService;
    private final TransactionalLockService transactionalLockService;

    public AppShutdownCoordinator(DistributedLockService lockService,
                              TransactionalLockService transactionalLockService) {
        this.lockService = lockService;
        this.transactionalLockService = transactionalLockService;
    }

    @PreDestroy
    public void onShutdown() {
        logger.info("Application shutdown - cleaning up resources");

        try {
            transactionalLockService.shutdown();
            logger.info("TransactionalLockService shutdown completed");
        } catch (Exception e) {
            logger.error("Error during TransactionalLockService shutdown", e);
        }

        try {
            lockService.shutdown();
            logger.info("DistributedLockService shutdown completed");
        } catch (Exception e) {
            logger.error("Error during DistributedLockService shutdown", e);
        }

    }
}
