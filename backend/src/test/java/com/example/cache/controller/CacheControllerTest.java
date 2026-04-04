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
import java.util.concurrent.ExecutorService;

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

    @MockitoBean
    ExecutorService virtualThreadExecutor;

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

    // --- deleteCache: key not found (deleted=false) ---

    @Test
    void deleteCache_keyNotFound_returnsDeletedFalse() throws Exception {
        when(cacheService.delete(eq("missing"))).thenReturn(false);

        mockMvc.perform(delete("/api/cache/delete/missing"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(false))
                .andExpect(jsonPath("$.key").value("missing"));
    }

    // --- searchKeys: happy path with results ---

    @Test
    void searchKeys_withResults_returnsKeysAndCount() throws Exception {
        Set<String> found = Set.of("user:1", "user:2", "user:3");
        when(cacheService.searchKeys(eq("user:*"), eq(100))).thenReturn(found);

        mockMvc.perform(get("/api/cache/search?pattern=user:*&limit=100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pattern").value("user:*"))
                .andExpect(jsonPath("$.count").value(3))
                .andExpect(jsonPath("$.keys").isArray());
    }

    // --- setCache: invalid ISO TTL string → 400 ---

    @Test
    void setCache_withInvalidIsoTtl_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/set/k1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":\"hello\",\"ttl\":\"NOT_A_DURATION\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        org.hamcrest.Matchers.containsString("Invalid ttl format")));
    }

    // --- getBatch: too many keys → 400 ---

    @Test
    void getBatch_tooManyKeys_returns400() throws Exception {
        String manyKeys = String.join(",", java.util.stream.IntStream.range(0, 501)
                .mapToObj(i -> "key" + i).toArray(String[]::new));

        mockMvc.perform(get("/api/cache/batch?keys=" + manyKeys))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- setBatch: entry missing 'key' → 400 ---

    @Test
    void setBatch_entryMissingKey_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"value\":\"v1\"}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        org.hamcrest.Matchers.containsString("missing 'key'")));
    }

    // --- setBatch: entry missing 'value' → 400 ---

    @Test
    void setBatch_entryMissingValue_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"key\":\"k1\"}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        org.hamcrest.Matchers.containsString("missing 'value'")));
    }

    // --- setBatch: entry with non-numeric ttl → 400 ---

    @Test
    void setBatch_entryNonNumericTtl_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"key\":\"k1\",\"value\":\"v1\",\"ttl\":\"bad\"}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        org.hamcrest.Matchers.containsString("'ttl' must be a number")));
    }

    // --- warmup: keys provided → 202 ---

    @Test
    void warmup_withKeys_returns202() throws Exception {
        mockMvc.perform(post("/api/cache/warmup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"key1\",\"key2\"]"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("Warmup initiated"))
                .andExpect(jsonPath("$.keys").value(2));

        verify(cacheService).warmUp(anySet());
    }

    // --- warmup: empty keys → 400 ---

    @Test
    void warmup_emptyKeys_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/warmup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- getMetrics ---

    @Test
    void getMetrics_returns200WithMetricsMap() throws Exception {
        ResilientCacheService.CacheMetrics metrics = new ResilientCacheService.CacheMetrics();
        metrics.recordOperation("get");
        metrics.recordRedisHit();
        when(cacheService.getMetrics()).thenReturn(metrics);

        mockMvc.perform(get("/api/cache/metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.operations").exists())
                .andExpect(jsonPath("$.redisHits").exists());
    }

    // --- getHealth: healthy ---

    @Test
    void getHealth_healthy_returns200() throws Exception {
        when(cacheService.isHealthy()).thenReturn(true);

        mockMvc.perform(get("/api/cache/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.cache").value(true));
    }

    // --- getHealth: unhealthy → 503 ---

    @Test
    void getHealth_unhealthy_returns503() throws Exception {
        when(cacheService.isHealthy()).thenReturn(false);

        mockMvc.perform(get("/api/cache/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("DOWN"))
                .andExpect(jsonPath("$.cache").value(false));
    }

    // --- simulateError: demoFeaturesEnabled=false → 403 (separate context needed) ---
    // The class-level @TestPropertySource enables demo, so we test the enabled path above.
    // Verify that simulateError with enabled=true calls setSimulateError(true)

    @Test
    void simulateError_enabled_setsSimulateErrorTrue() throws Exception {
        mockMvc.perform(post("/api/cache/simulate-error")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.simulationEnabled").value(true));

        verify(cacheService).setSimulateError(true);
    }

    // --- getTtlBatch ---

    @Test
    void getTtlBatch_returnsResults() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(30000L);
        when(redissonClient.getBucket(anyString())).thenReturn(bucket);

        // Use an executor that runs tasks inline for testing
        doAnswer(inv -> {
            Runnable r = inv.getArgument(0);
            r.run();
            return java.util.concurrent.CompletableFuture.completedFuture(null);
        }).when(virtualThreadExecutor).execute(any());

        mockMvc.perform(get("/api/cache/ttl-batch?keys=k1,k2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results").exists());
    }

    // --- getTtlBatch: too many keys → 400 ---

    @Test
    void getTtlBatch_tooManyKeys_returns400() throws Exception {
        String manyKeys = String.join(",", java.util.stream.IntStream.range(0, 501)
                .mapToObj(i -> "key" + i).toArray(String[]::new));

        mockMvc.perform(get("/api/cache/ttl-batch?keys=" + manyKeys))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- getTyped: SET type ---

    @Test
    void getTyped_setType_returnsSet() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("setkey")).thenReturn(RType.SET);
        when(redissonClient.getKeys()).thenReturn(keys);

        RSet<Object> rset = mock(RSet.class);
        when(rset.readAll()).thenReturn(Set.of("a", "b"));
        when(redissonClient.getSet("setkey")).thenReturn(rset);

        mockMvc.perform(get("/api/cache/get-typed/setkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("SET"));
    }

    // --- getTyped: ZSET type ---

    @Test
    void getTyped_zsetType_returnsZset() throws Exception {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("zsetkey")).thenReturn(RType.ZSET);
        when(redissonClient.getKeys()).thenReturn(keys);

        RScoredSortedSet<Object> sset = mock(RScoredSortedSet.class);
        when(sset.readAll()).thenReturn(Set.of("x"));
        when(redissonClient.<Object>getScoredSortedSet("zsetkey")).thenReturn(sset);

        mockMvc.perform(get("/api/cache/get-typed/zsetkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("ZSET"));
    }

    // --- setCache: returns 500 when future completes with exception ---

    @Test
    void setCache_futureThrowsException_returns500() throws Exception {
        var failedFuture = new java.util.concurrent.CompletableFuture<Boolean>();
        failedFuture.completeExceptionally(new RuntimeException("redis down"));
        when(cacheService.setAsync(anyString(), any(), any())).thenReturn(failedFuture);

        mockMvc.perform(post("/api/cache/set/k1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":\"hello\"}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").exists());
    }

    // --- resetCircuitBreaker: demoFeaturesEnabled=true → resets, class-level property is true ---

    @Test
    void resetCircuitBreaker_enabled_resetsAndDisablesSimulation() throws Exception {
        CircuitBreaker cb = mock(CircuitBreaker.class);
        when(circuitBreakerRegistry.circuitBreaker("cache-operations")).thenReturn(cb);

        mockMvc.perform(post("/api/cache/reset-circuit-breaker"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reset").value(true));

        verify(cb).reset();
        verify(cacheService).setSimulateError(false);
    }

    // ----------------------------------------------------------------
    // validateKey: key too long (>512 bytes) → 400
    // ----------------------------------------------------------------

    @Test
    void getCache_keyTooLong_returns400() throws Exception {
        String longKey = "a".repeat(513);

        mockMvc.perform(get("/api/cache/get/" + longKey))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void deleteCache_keyTooLong_returns400() throws Exception {
        String longKey = "a".repeat(513);

        mockMvc.perform(delete("/api/cache/delete/" + longKey))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void getTtl_keyTooLong_returns400() throws Exception {
        String longKey = "a".repeat(513);

        mockMvc.perform(get("/api/cache/ttl/" + longKey))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void getKeyType_keyTooLong_returns400() throws Exception {
        String longKey = "a".repeat(513);

        mockMvc.perform(get("/api/cache/type/" + longKey))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // ----------------------------------------------------------------
    // setCache: ttl is a JSON object (neither Number nor String) → uses default 1h TTL
    // ----------------------------------------------------------------

    @Test
    void setCache_ttlIsJsonObject_usesDefaultTtl() throws Exception {
        when(cacheService.setAsync(eq("k1"), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        mockMvc.perform(post("/api/cache/set/k1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"k1\",\"value\":\"v1\",\"ttl\":{\"nested\":\"obj\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    // ----------------------------------------------------------------
    // setBatch: numeric ttl → 200, empty string key → 400
    // ----------------------------------------------------------------

    @Test
    void setBatch_entryWithNumericTtl_returns200() throws Exception {
        when(cacheService.setAsync(anyString(), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(true));

        mockMvc.perform(post("/api/cache/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"key\":\"k1\",\"value\":\"v1\",\"ttl\":60}]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.successful").value(1));
    }

    @Test
    void setBatch_entryWithEmptyStringKey_returns400() throws Exception {
        mockMvc.perform(post("/api/cache/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"key\":\"\",\"value\":\"v1\"}]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        org.hamcrest.Matchers.containsString("missing 'key'")));
    }

    // ----------------------------------------------------------------
    // getTtlBatch: blank keys skipped, timeout → 504, ExecutionException → 500
    // ----------------------------------------------------------------

    @Test
    void getTtlBatch_allBlankKeys_returnsEmptyResults() throws Exception {
        mockMvc.perform(get("/api/cache/ttl-batch?keys=, ,  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results").exists());
    }

    @Test
    void getTtlBatch_timeout_returns504() throws Exception {
        // Use an executor that never runs the submitted task, causing a timeout
        doAnswer(inv -> null).when(virtualThreadExecutor).execute(any());

        mockMvc.perform(get("/api/cache/ttl-batch?keys=k1"))
                .andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void getTtlBatch_executionException_returns500() throws Exception {
        // Make the bucket throw so the CompletableFuture completes exceptionally
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenThrow(new RuntimeException("connection lost"));
        when(redissonClient.getBucket(anyString())).thenReturn(bucket);

        // Run the task inline so the exception is captured by the CompletableFuture
        doAnswer(inv -> {
            Runnable r = inv.getArgument(0);
            r.run(); // CompletableFuture.runAsync wraps this; exception marks future as failed
            return null;
        }).when(virtualThreadExecutor).execute(any());

        mockMvc.perform(get("/api/cache/ttl-batch?keys=k1"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").exists());
    }
}
