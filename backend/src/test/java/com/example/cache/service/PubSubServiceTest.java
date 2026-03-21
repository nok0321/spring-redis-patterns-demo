package com.example.cache.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PubSubServiceTest {

    @Mock
    RedissonClient redissonClient;

    @InjectMocks
    PubSubService pubSubService;

    @Mock
    RTopic rTopic;

    @BeforeEach
    void setUp() {
        // lenient: not all tests call getTopic (e.g. createEmitter tests)
        lenient().when(redissonClient.getTopic(anyString())).thenReturn(rTopic);
    }

    @Test
    void addSubscriber_firstTime_registersListener() {
        pubSubService.addSubscriber("test-topic");

        verify(rTopic, times(1)).addListener(eq(String.class), any());
    }

    @Test
    void addSubscriber_duplicate_doesNotRegisterTwice() {
        pubSubService.addSubscriber("dup-topic");
        pubSubService.addSubscriber("dup-topic");

        verify(rTopic, times(1)).addListener(eq(String.class), any());
    }

    @Test
    void publish_callsRTopicPublish() {
        when(rTopic.publish("hello")).thenReturn(1L);

        long subs = pubSubService.publish("my-topic", "hello");
        assertThat(subs).isEqualTo(1L);

        verify(rTopic).publish("hello");
    }

    @Test
    void createEmitter_belowLimit_returnsEmitter() {
        SseEmitter emitter = pubSubService.createEmitter();
        assertThat(emitter).isNotNull();
    }

    @Test
    void createEmitter_overLimit_throwsIllegalState() {
        // Fill up to MAX_EMITTERS (100)
        for (int i = 0; i < 100; i++) {
            pubSubService.createEmitter();
        }

        assertThatThrownBy(() -> pubSubService.createEmitter())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("100");
    }
}
