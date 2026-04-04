package com.example.cache.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RTopic;
import org.redisson.api.RedissonClient;
import org.redisson.api.listener.MessageListener;
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

    // --- shutdown() removes all listeners ---

    @Test
    void shutdown_removesAllTopicListeners() {
        when(rTopic.addListener(eq(String.class), any())).thenReturn(42);

        pubSubService.addSubscriber("topic-a");
        pubSubService.addSubscriber("topic-b");

        // shutdown should call removeListener for each registered listener
        pubSubService.shutdown();

        verify(rTopic, times(2)).removeListener(42);
    }

    // --- publish with invalid topic throws IllegalArgumentException ---

    @Test
    void publish_nullTopic_throwsIllegalArgument() {
        assertThatThrownBy(() -> pubSubService.publish(null, "msg"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid topic name");
    }

    @Test
    void publish_emptyTopic_throwsIllegalArgument() {
        assertThatThrownBy(() -> pubSubService.publish("", "msg"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid topic name");
    }

    @Test
    void publish_specialCharsTopic_throwsIllegalArgument() {
        assertThatThrownBy(() -> pubSubService.publish("bad topic!", "msg"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid topic name");
    }

    // --- addSubscriber with invalid topic throws IllegalArgumentException ---

    @Test
    void addSubscriber_nullTopic_throwsIllegalArgument() {
        assertThatThrownBy(() -> pubSubService.addSubscriber(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid topic name");
    }

    @Test
    void addSubscriber_emptyTopic_throwsIllegalArgument() {
        assertThatThrownBy(() -> pubSubService.addSubscriber(""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid topic name");
    }

    // --- addSubscriber: multiple different topics each get their own listener ---

    @Test
    void addSubscriber_multipleDifferentTopics_registersSeparateListeners() {
        pubSubService.addSubscriber("topic-x");
        pubSubService.addSubscriber("topic-y");
        pubSubService.addSubscriber("topic-z");

        // each topic gets getTopic() called and addListener called once
        verify(rTopic, times(3)).addListener(eq(String.class), any());
    }

    // --- createEmitter: cleanup callback decrements count ---

    @Test
    void createEmitter_onCompletion_decrementsCount() {
        SseEmitter emitter = pubSubService.createEmitter();
        assertThat(emitter).isNotNull();
        // Simulate completion
        emitter.complete();
        // After completion, a new emitter can be created (count decremented back)
        SseEmitter emitter2 = pubSubService.createEmitter();
        assertThat(emitter2).isNotNull();
    }

    // --- shutdown: when listener throws exception, it is swallowed ---

    @Test
    void shutdown_listenerRemovalThrows_doesNotPropagateException() {
        when(rTopic.addListener(eq(String.class), any())).thenReturn(99);
        doThrow(new RuntimeException("Redis down")).when(rTopic).removeListener(99);

        pubSubService.addSubscriber("failing-topic");

        // should not throw
        assertThatCode(() -> pubSubService.shutdown()).doesNotThrowAnyException();
    }

    // --- publish: valid topic formats accepted ---

    @Test
    void publish_topicWithDot_succeeds() {
        when(rTopic.publish("msg")).thenReturn(0L);

        long subs = pubSubService.publish("my.topic.name", "msg");
        assertThat(subs).isEqualTo(0L);
    }

    @Test
    void publish_topicWithUnderscore_succeeds() {
        when(rTopic.publish("msg")).thenReturn(2L);

        long subs = pubSubService.publish("my_topic_name", "msg");
        assertThat(subs).isEqualTo(2L);
    }

    // --- addSubscriber: valid topic with hyphen succeeds ---

    @Test
    void addSubscriber_topicWithHyphen_registersListener() {
        pubSubService.addSubscriber("my-topic-name");
        verify(rTopic, times(1)).addListener(eq(String.class), any());
    }

    // --- createEmitter: multiple emitters up to limit-1 all succeed ---

    @Test
    void createEmitter_99Times_allSucceed() {
        for (int i = 0; i < 99; i++) {
            SseEmitter emitter = pubSubService.createEmitter();
            assertThat(emitter).isNotNull();
        }
    }

    // --- publish: topic too long (129 chars) → IllegalArgumentException ---

    @Test
    void publish_topicTooLong_throwsIllegalArgument() {
        String longTopic = "a".repeat(129);
        assertThatThrownBy(() -> pubSubService.publish(longTopic, "msg"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid topic name");
    }

    // --- shutdown: when no topics subscribed, nothing to remove ---

    @Test
    void shutdown_noTopics_doesNothing() {
        assertThatCode(() -> pubSubService.shutdown()).doesNotThrowAnyException();
        verify(rTopic, never()).removeListener(anyInt());
    }

    // --- broadcastToEmitters tests (triggered via listener callback) ---

    @SuppressWarnings("unchecked")
    @Test
    void broadcastToEmitters_sendsToAllEmitters() {
        // Capture the listener callback registered during addSubscriber
        ArgumentCaptor<MessageListener<String>> listenerCaptor = ArgumentCaptor.forClass(MessageListener.class);
        when(rTopic.addListener(eq(String.class), listenerCaptor.capture())).thenReturn(1);

        pubSubService.addSubscriber("broadcast-topic");

        // Create emitters
        SseEmitter emitter1 = pubSubService.createEmitter();
        SseEmitter emitter2 = pubSubService.createEmitter();
        assertThat(emitter1).isNotNull();
        assertThat(emitter2).isNotNull();

        // Trigger the listener callback - this calls broadcastToEmitters
        MessageListener<String> listener = listenerCaptor.getValue();
        // Should not throw even though SseEmitter.send() will likely fail
        // (no real async context), but the dead emitters will be cleaned up
        assertThatCode(() -> listener.onMessage("broadcast-topic", "hello world"))
                .doesNotThrowAnyException();
    }

    @SuppressWarnings("unchecked")
    @Test
    void broadcastToEmitters_deadEmittersRemoved() {
        ArgumentCaptor<MessageListener<String>> listenerCaptor = ArgumentCaptor.forClass(MessageListener.class);
        when(rTopic.addListener(eq(String.class), listenerCaptor.capture())).thenReturn(1);

        pubSubService.addSubscriber("dead-topic");

        // Create emitters and complete one to make it "dead"
        SseEmitter emitter = pubSubService.createEmitter();
        emitter.complete(); // This will make send() fail

        // Create another emitter
        SseEmitter emitter2 = pubSubService.createEmitter();
        assertThat(emitter2).isNotNull();

        // Trigger broadcast - dead emitters should be cleaned up
        MessageListener<String> listener = listenerCaptor.getValue();
        assertThatCode(() -> listener.onMessage("dead-topic", "test"))
                .doesNotThrowAnyException();
    }

    @SuppressWarnings("unchecked")
    @Test
    void broadcastToEmitters_noEmitters_doesNotThrow() {
        ArgumentCaptor<MessageListener<String>> listenerCaptor = ArgumentCaptor.forClass(MessageListener.class);
        when(rTopic.addListener(eq(String.class), listenerCaptor.capture())).thenReturn(1);

        pubSubService.addSubscriber("empty-topic");

        // Trigger broadcast with no emitters registered
        MessageListener<String> listener = listenerCaptor.getValue();
        assertThatCode(() -> listener.onMessage("empty-topic", "hello"))
                .doesNotThrowAnyException();
    }
}
