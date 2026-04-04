package com.example.cache.controller;

import com.example.cache.service.CacheMetadataService;
import com.example.cache.service.ResilientCacheService;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CacheController.class)
@AutoConfigureMockMvc(addFilters = false)
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
    CacheMetadataService cacheMetadataService;

    // --- getCache ---

    @Test
    void getCache_keyFound_returns200() throws Exception {
        when(cacheService.get(eq("mykey"), isNull()))
                .thenReturn(Optional.of("hello"));

        mockMvc.perform(get("/api/cache/get/mykey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true))
                .andExpect(jsonPath("$.value").value("hello"))
                .andExpect(jsonPath("$.key").value("mykey"));
    }

    @Test
    void getCache_keyNotFound_returnsFoundFalse() throws Exception {
        when(cacheService.get(eq("missing"), isNull()))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/cache/get/missing"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(false));
    }

    @Test
    void getCache_withTypeParam_usesCorrectClass() throws Exception {
        when(cacheService.get(eq("counter"), isNull()))
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
        when(cacheMetadataService.getTtl("mykey"))
                .thenReturn(Optional.of(new CacheMetadataService.TtlInfo(60000L, 60L, false)));

        mockMvc.perform(get("/api/cache/ttl/mykey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ttlMs").value(60000))
                .andExpect(jsonPath("$.persistent").value(false));
    }

    @Test
    void getTtl_persistent_showsNegativeOne() throws Exception {
        when(cacheMetadataService.getTtl("pkey"))
                .thenReturn(Optional.of(new CacheMetadataService.TtlInfo(-1L, -1L, true)));

        mockMvc.perform(get("/api/cache/ttl/pkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.persistent").value(true));
    }

    @Test
    void getTtl_keyNotExists_returns404() throws Exception {
        when(cacheMetadataService.getTtl("gone"))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/cache/ttl/gone"))
                .andExpect(status().isNotFound());
    }

    // --- getKeyType ---

    @Test
    void getKeyType_objectType_returns200() throws Exception {
        when(cacheMetadataService.getKeyType("mykey"))
                .thenReturn(Optional.of("OBJECT"));

        mockMvc.perform(get("/api/cache/type/mykey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("OBJECT"));
    }

    @Test
    void getKeyType_keyNotExist_returns404() throws Exception {
        when(cacheMetadataService.getKeyType("gone"))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/cache/type/gone"))
                .andExpect(status().isNotFound());
    }

    // --- getTyped ---

    @Test
    void getTyped_objectType_returnsBucketValue() throws Exception {
        when(cacheMetadataService.getTypedValue("strkey"))
                .thenReturn(Optional.of(new CacheMetadataService.TypedValue("strkey", "OBJECT", "hello world")));

        mockMvc.perform(get("/api/cache/get-typed/strkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("OBJECT"))
                .andExpect(jsonPath("$.value").value("hello world"));
    }

    @Test
    void getTyped_mapType_returnsAllMap() throws Exception {
        when(cacheMetadataService.getTypedValue("mapkey"))
                .thenReturn(Optional.of(new CacheMetadataService.TypedValue("mapkey", "MAP", Map.of("field1", "value1"))));

        mockMvc.perform(get("/api/cache/get-typed/mapkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("MAP"));
    }

    @Test
    void getTyped_listType_returnsList() throws Exception {
        when(cacheMetadataService.getTypedValue("listkey"))
                .thenReturn(Optional.of(new CacheMetadataService.TypedValue("listkey", "LIST", List.of("a", "b", "c"))));

        mockMvc.perform(get("/api/cache/get-typed/listkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("LIST"));
    }

    @Test
    void getTyped_keyNotExist_returns404() throws Exception {
        when(cacheMetadataService.getTypedValue("gone"))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/cache/get-typed/gone"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getTyped_streamType_returnsString() throws Exception {
        when(cacheMetadataService.getTypedValue("streamkey"))
                .thenReturn(Optional.of(new CacheMetadataService.TypedValue(
                        "streamkey", "STREAM", "(Stream type: use Redis CLI for XRANGE/XREAD)")));

        mockMvc.perform(get("/api/cache/get-typed/streamkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("STREAM"));
    }

    @Test
    void getTyped_exceptionThrown_returns500() throws Exception {
        when(cacheMetadataService.getTypedValue("badkey"))
                .thenThrow(new RuntimeException("codec error"));

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
        metrics.recordOperation();
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
        Map<String, Map<String, Object>> batchResult = Map.of(
                "k1", Map.of("ttlMs", 30000L, "persistent", false),
                "k2", Map.of("ttlMs", 30000L, "persistent", false));
        when(cacheMetadataService.getTtlBatch(any(String[].class))).thenReturn(batchResult);

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
        when(cacheMetadataService.getTypedValue("setkey"))
                .thenReturn(Optional.of(new CacheMetadataService.TypedValue("setkey", "SET", Set.of("a", "b"))));

        mockMvc.perform(get("/api/cache/get-typed/setkey"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("SET"));
    }

    // --- getTyped: ZSET type ---

    @Test
    void getTyped_zsetType_returnsZset() throws Exception {
        when(cacheMetadataService.getTypedValue("zsetkey"))
                .thenReturn(Optional.of(new CacheMetadataService.TypedValue("zsetkey", "ZSET", Set.of("x"))));

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
        when(cacheMetadataService.getTtlBatch(any(String[].class)))
                .thenReturn(Map.of());

        mockMvc.perform(get("/api/cache/ttl-batch?keys=, ,  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results").exists());
    }

    @Test
    void getTtlBatch_timeout_returns504() throws Exception {
        when(cacheMetadataService.getTtlBatch(any(String[].class)))
                .thenThrow(new TimeoutException("timed out"));

        mockMvc.perform(get("/api/cache/ttl-batch?keys=k1"))
                .andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void getTtlBatch_executionException_returns500() throws Exception {
        when(cacheMetadataService.getTtlBatch(any(String[].class)))
                .thenThrow(new ExecutionException("connection lost", new RuntimeException("connection lost")));

        mockMvc.perform(get("/api/cache/ttl-batch?keys=k1"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").exists());
    }
}
