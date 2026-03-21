package com.example.cache.config;

import com.example.cache.config.AppShutdownCoordinator;
import com.example.cache.service.DistributedLockService;
import com.example.cache.service.ResilientCacheService;
import com.example.cache.service.TransactionalLockService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AppLifecycleConfigTest {

    @Mock
    ResilientCacheService cacheService;

    @Mock
    DistributedLockService lockService;

    @Mock
    TransactionalLockService transactionalLockService;

    @InjectMocks
    AppShutdownCoordinator appLifecycleConfig;

    @Test
    void onShutdown_callsAllServiceShutdowns() {
        appLifecycleConfig.onShutdown();

        verify(transactionalLockService).shutdown();
        verify(lockService).shutdown();
        verify(cacheService).shutdown();
    }

    @Test
    void onShutdown_whenServiceThrows_stillCallsOthers() {
        doThrow(new RuntimeException("shutdown error")).when(transactionalLockService).shutdown();

        // Should not throw - each shutdown is in its own try-catch
        appLifecycleConfig.onShutdown();

        verify(lockService).shutdown();
        verify(cacheService).shutdown();
    }
}
