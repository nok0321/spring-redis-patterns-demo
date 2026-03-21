package com.example.cache.controller;

import com.example.cache.service.ResilientCacheService;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.Test;
import org.redisson.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.*;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CacheController.class)
@TestPropertySource(properties = "demo.features.enabled=true")
@SuppressWarnings("unchecked") // Mockito.mock(Class) returns raw type; generic assignments are safe in test stubs
class CacheControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    ResilientCacheService cacheService;

    @MockitoBean
    CircuitBreakerRegistry circuitBreakerRegistry;

    @MockitoBean
    RedissonClient redissonClient;

    // --- getCache ---

    @Test
    void getCache_keyFound_returns200() throws Exception {
        when(cacheService.get(eq("mykey"), any(), isNull()))
                .thenReturn(Optional.of("hello"));

        mockMvc.perform(get("/api/cache/get/mykey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true))
                .andExpect(jsonPath("$.value").value("hello"))
                .andExpect(jsonPath("$.key").value("mykey"));
    }

    @Test
    void getCache_keyNotFound_returnsFoundFalse() throws Exception {
        when(cacheService.get(eq("missing"), any(), isNull()))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/cache/get/missing"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(false));
    }

    @Test
    void getCache_withTypeParam_usesCorrectClass() throws Exception {
        when(cacheService.get(eq("counter"), any(), isNull()))
                .thenReturn(Optional.of(42));

        mockMvc.perform(get("/api/cache/get/counter?type=integer"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true));
    }

    // --- getBatch ---

    @Test
    void getBatch_returnsResults() throws Exception {
        Map<String, Object> results = Map.of("k1", "v1", "k2", "v2");
        when(cacheService.getBatch(anySet())).thenReturn(results);

        mockMvc.perform(get("/api/cache/batch?keys=k1,k2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(2));
    }

    @Test
    void getBatch_emptyKeys_returns400() throws Exception {
        mockMvc.perform(get("/api/cache/batch?keys="))
                .andExpect(status().isBadRequest());
    }

    // --- searchKeys ---

    @Test
    void searchKeys_limitZero_becomesSafeLimit1() throws Exception {
        when(cacheService.searchKeys(eq("*"), eq(1)))
                .thenReturn(Set.of("k1"));

        mockMvc.perform(get("/api/cache/search?pattern=*&limit=0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limit").value(1));
    }

    @Test
    void searchKeys_limit9999_clampsTo1000() throws Exception {
        when(cacheService.searchKeys(eq("*"), eq(1000)))
                .thenReturn(Set.of());

        mockMvc.perform(get("/api/cache/search?pattern=*&limit=9999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limit").value(1000));
    }

    // --- setCache ---

    @Test
    void setCache_normalRequest_returns200() throws Exception {
        when(cacheService.setAsync(eq("k1"), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        String body = "{\"value\":\"hello\"}";
        mockMvc.perform(post("/api/cache/set/k1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void setCache_missingValue_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/set/k1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void setCache_withNumericTtl_usesSeconds() throws Exception {
        when(cacheService.setAsync(eq("k1"), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        mockMvc.perform(post("/api/cache/set/k1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":\"v\",\"ttl\":120}"))
                .andExpect(status().isOk());
    }

    @Test
    void setCache_withStringTtl_parses() throws Exception {
        when(cacheService.setAsync(eq("k1"), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        mockMvc.perform(post("/api/cache/set/k1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":\"v\",\"ttl\":\"PT2H\"}"))
                .andExpect(status().isOk());
    }

    // --- setBatch ---

    @Test
    void setBatch_normalRequest_returns200() throws Exception {
        when(cacheService.setAsync(anyString(), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        String body = "[{\"key\":\"k1\",\"value\":\"v1\"},{\"key\":\"k2\",\"value\":\"v2\"}]";
        mockMvc.perform(post("/api/cache/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2));
    }

    @Test
    void setBatch_emptyList_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(status().isBadRequest());
    }

    // --- deleteCache ---

    @Test
    void deleteCache_success_returns200() throws Exception {
        when(cacheService.delete(eq("k1"))).thenReturn(true);

        mockMvc.perform(delete("/api/cache/delete/k1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(true));
    }

    // --- simulateError / resetCircuitBreaker ---

    @Test
    void simulateError_enable_callsService() throws Exception {
        mockMvc.perform(post("/api/cache/simulate-error")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.simulationEnabled").value(true));

        verify(cacheService).setSimulateError(true);
    }

    @Test
    void simulateError_disable_callsService() throws Exception {
        mockMvc.perform(post("/api/cache/simulate-error")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.simulationEnabled").value(false));
    }

    @Test
    void resetCircuitBreaker_callsResetAndDisableSimulation() throws Exception {
        CircuitBreaker cb = mock(CircuitBreaker.class);
        when(circuitBreakerRegistry.circuitBreaker("cache-operations")).thenReturn(cb);

        mockMvc.perform(post("/api/cache/reset-circuit-breaker"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reset").value(true))
                .andExpect(jsonPath("$.state").value("CLOSED"));

        verify(cb).reset();
        verify(cacheService).setSimulateError(false);
    }

    // --- getTtl ---

    @Test
    void getTtl_keyExists_returns200() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(60000L);
        when(redissonClient.getBucket("mykey")).thenReturn(bucket);

        mockMvc.perform(get("/api/cache/ttl/mykey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ttlMs").value(60000))
                .andExpect(jsonPath("$.persistent").value(false));
    }

    @Test
    void getTtl_persistent_showsNegativeOne() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(-1L);
        when(redissonClient.getBucket("pkey")).thenReturn(bucket);

        mockMvc.perform(get("/api/cache/ttl/pkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.persistent").value(true));
    }

    @Test
    void getTtl_keyNotExists_returns404() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(-2L);
        when(redissonClient.getBucket("gone")).thenReturn(bucket);

        mockMvc.perform(get("/api/cache/ttl/gone"))
                .andExpect(status().isNotFound());
    }

    // --- getKeyType ---

    @Test
    void getKeyType_objectType_returns200() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("mykey")).thenReturn(RType.OBJECT);
        when(redissonClient.getKeys()).thenReturn(keys);

        mockMvc.perform(get("/api/cache/type/mykey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("OBJECT"));
    }

    @Test
    void getKeyType_keyNotExist_returns404() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("gone")).thenReturn(null);
        when(redissonClient.getKeys()).thenReturn(keys);

        mockMvc.perform(get("/api/cache/type/gone"))
                .andExpect(status().isNotFound());
    }

    // --- getTyped ---

    @Test
    void getTyped_objectType_returnsBucketValue() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("strkey")).thenReturn(RType.OBJECT);
        when(redissonClient.getKeys()).thenReturn(keys);

        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.get()).thenReturn("hello world");
        when(redissonClient.getBucket("strkey")).thenReturn(bucket);

        mockMvc.perform(get("/api/cache/get-typed/strkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("OBJECT"))
                .andExpect(jsonPath("$.value").value("hello world"));
    }

    @Test
    void getTyped_mapType_returnsAllMap() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("mapkey")).thenReturn(RType.MAP);
        when(redissonClient.getKeys()).thenReturn(keys);

        RMap<Object, Object> map = mock(RMap.class);
        when(map.readAllMap()).thenReturn(Map.of("field1", "value1"));
        when(redissonClient.getMap("mapkey")).thenReturn(map);

        mockMvc.perform(get("/api/cache/get-typed/mapkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("MAP"));
    }

    @Test
    void getTyped_listType_returnsList() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("listkey")).thenReturn(RType.LIST);
        when(redissonClient.getKeys()).thenReturn(keys);

        RList<Object> list = mock(RList.class);
        when(list.readAll()).thenReturn(List.of("a", "b", "c"));
        when(redissonClient.getList("listkey")).thenReturn(list);

        mockMvc.perform(get("/api/cache/get-typed/listkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("LIST"));
    }

    @Test
    void getTyped_keyNotExist_returns404() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("gone")).thenReturn(null);
        when(redissonClient.getKeys()).thenReturn(keys);

        mockMvc.perform(get("/api/cache/get-typed/gone"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getTyped_streamType_returnsString() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("streamkey")).thenReturn(RType.STREAM);
        when(redissonClient.getKeys()).thenReturn(keys);

        mockMvc.perform(get("/api/cache/get-typed/streamkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("STREAM"));
    }

    @Test
    void getTyped_exceptionThrown_returns500() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("badkey")).thenReturn(RType.OBJECT);
        when(redissonClient.getKeys()).thenReturn(keys);

        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.get()).thenThrow(new RuntimeException("codec error"));
        when(redissonClient.getBucket("badkey")).thenReturn(bucket);

        mockMvc.perform(get("/api/cache/get-typed/badkey"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").exists());
    }
}
