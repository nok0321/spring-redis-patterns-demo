package com.example.cache.controller;

import com.example.cache.service.PubSubService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@Tag(name = "PubSub", description = "Redis Pub/Sub メッセージング（発行・SSE ストリーム購読）")
@RestController
@RequestMapping("/api/pubsub")
public class PubSubController {

    private static final Logger logger = LoggerFactory.getLogger(PubSubController.class);

    private final PubSubService pubSubService;

    public PubSubController(PubSubService pubSubService) {
        this.pubSubService = pubSubService;
    }

    @Operation(summary = "メッセージ発行", description = "指定トピックにメッセージを発行する。topic 省略時は 'default'")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "発行成功（subscribers=受信者数）"),
        @ApiResponse(responseCode = "400", description = "message が未指定")
    })
    @PostMapping("/publish")
    public ResponseEntity<Map<String, Object>> publish(
            @RequestBody Map<String, Object> body) {

        String topic   = (String) body.getOrDefault("topic",   "default");
        String message = (String) body.getOrDefault("message", "");

        if (message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "message は必須です",
                    "timestamp", System.currentTimeMillis()));
        }

        // サブスクライバー側で受信できるよう購読を登録してから送信
        pubSubService.addSubscriber(topic);
        long subscribers = pubSubService.publish(topic, message);

        return ResponseEntity.ok(Map.of(
                "topic",       topic,
                "message",     message,
                "subscribers", subscribers,
                "timestamp",   System.currentTimeMillis()));
    }

    @Operation(summary = "SSE 購読", description = "Server-Sent Events でメッセージをストリーム受信する（Content-Type: text/event-stream）")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "SSE ストリーム開始"),
        @ApiResponse(responseCode = "503", description = "接続数上限超過")
    })
    @GetMapping(value = "/subscribe", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> subscribe() {
        logger.info("SSE 接続開始");
        try {
            return ResponseEntity.ok(pubSubService.createEmitter());
        } catch (IllegalStateException e) {
            logger.warn("SSE 接続拒否: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }
}
