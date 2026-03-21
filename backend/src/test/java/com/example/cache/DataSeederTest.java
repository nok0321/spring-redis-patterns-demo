package com.example.cache;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;

import java.time.Duration;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked") // Mockito.mock(Class) returns raw type; generic assignment is safe in test stubs
class DataSeederTest {

    @Mock
    RedissonClient redissonClient;

    @InjectMocks
    DataSeeder dataSeeder;

    @Test
    void seedDemoData_callsSetIfAbsentForAllKeys() {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.setIfAbsent(any(), any(Duration.class))).thenReturn(true);
        when(redissonClient.<Object>getBucket(anyString())).thenReturn(bucket);

        dataSeeder.seedDemoData();

        // Verify 8 keys are seeded: alice, bob, greeting, counter, config, session, balance:A, balance:B
        verify(redissonClient, times(8)).getBucket(anyString());
        verify(bucket, times(8)).setIfAbsent(any(), any(Duration.class));
    }

    @Test
    void seedDemoData_exceptionFromBucket_doesNotPropagate() {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.setIfAbsent(any(), any(Duration.class)))
                .thenThrow(new RuntimeException("Redis down"));
        when(redissonClient.<Object>getBucket(anyString())).thenReturn(bucket);

        // Should not throw
        dataSeeder.seedDemoData();
    }
}
