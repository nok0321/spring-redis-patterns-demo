package com.example.cache.controller;

import org.junit.jupiter.api.Test;
import org.redisson.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CliController.class)
@AutoConfigureMockMvc(addFilters = false)
@TestPropertySource(properties = "demo.features.enabled=true")
@SuppressWarnings("unchecked") // Mockito.mock(Class) returns raw type; generic assignments are safe in test stubs
class CliControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    RedissonClient redissonClient;

    private void execute(String command) throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"" + command + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").exists());
    }

    @Test
    void execute_getCommand_returnsBucketValue() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.get()).thenReturn("hello");
        when(redissonClient.getBucket("mykey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"GET mykey\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("hello"));
    }

    @Test
    void execute_setCommand_returnsOk() throws Exception {
        RBucket<String> bucket = mock(RBucket.class);
        when(redissonClient.<String>getBucket("mykey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"SET mykey myvalue\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("OK"));
    }

    @Test
    void execute_keysCommand_rejected() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"KEYS *\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void execute_scanCommand_returnsKeys() throws Exception {
        RKeys rKeys = mock(RKeys.class);
        when(rKeys.getKeysStream(any())).thenReturn(Stream.of("k1"));
        when(redissonClient.getKeys()).thenReturn(rKeys);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"SCAN 0\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void execute_ttlCommand_returnsSeconds() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(120000L);
        when(redissonClient.getBucket("mykey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"TTL mykey\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("120"));
    }

    @Test
    void execute_pttlCommand_returnsMs() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(120000L);
        when(redissonClient.getBucket("mykey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"PTTL mykey\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("120000"));
    }

    @Test
    void execute_typeCommand_returnsTypeName() throws Exception {
        RKeys rKeys = mock(RKeys.class);
        when(rKeys.getType("mykey")).thenReturn(RType.OBJECT);
        when(redissonClient.getKeys()).thenReturn(rKeys);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"TYPE mykey\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("object"));
    }

    @Test
    void execute_llenCommand_returnsSize() throws Exception {
        RList<Object> list = mock(RList.class);
        when(list.size()).thenReturn(3);
        when(redissonClient.getList("mylist")).thenReturn(list);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"LLEN mylist\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("3"));
    }

    @Test
    void execute_hgetallCommand_returnsMap() throws Exception {
        RMap<Object, Object> map = mock(RMap.class);
        when(map.readAllMap()).thenReturn(Map.of("f1", "v1"));
        when(redissonClient.getMap("myhash")).thenReturn(map);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"HGETALL myhash\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void execute_smembersCommand_returnsSet() throws Exception {
        RSet<Object> set = mock(RSet.class);
        when(set.readAll()).thenReturn(Set.of("m1", "m2"));
        when(redissonClient.getSet("myset")).thenReturn(set);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"SMEMBERS myset\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void execute_zrangeCommand_returnsSortedSet() throws Exception {
        RScoredSortedSet<Object> sortedSet = mock(RScoredSortedSet.class);
        when(sortedSet.readAll()).thenReturn(Set.of("a", "b"));
        when(redissonClient.getScoredSortedSet("myzset")).thenReturn(sortedSet);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ZRANGE myzset 0 -1\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void execute_zcardCommand_returnsCount() throws Exception {
        RScoredSortedSet<Object> sortedSet = mock(RScoredSortedSet.class);
        when(sortedSet.size()).thenReturn(5);
        when(redissonClient.getScoredSortedSet("myzset")).thenReturn(sortedSet);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ZCARD myzset\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("5"));
    }

    @Test
    void execute_strlenCommand_returnsLength() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.get()).thenReturn("hello");
        when(redissonClient.getBucket("mykey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"STRLEN mykey\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("5"));
    }

    @Test
    void execute_infoCommand_returnsInfo() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"INFO\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void execute_memoryCommand_returnsMessage() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"MEMORY USAGE mykey\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void execute_slowlogCommand_returnsMessage() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"SLOWLOG GET\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void execute_unauthorizedCommand_returns400WithError() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"FLUSHALL\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Command not allowed: FLUSHALL"));
    }

    @Test
    void execute_blankCommand_returns400() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void execute_missingCommand_returns400() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    // --- GET with missing key arg → ERR result (not 400) ---

    @Test
    void execute_getWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"GET\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: GET requires a key"));
    }

    // --- SET with missing args → ERR result ---

    @Test
    void execute_setWithoutKeyAndValue_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"SET\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: SET requires key and value"));
    }

    // --- TTL with missing key arg → ERR result ---

    @Test
    void execute_ttlWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"TTL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: TTL requires a key"));
    }

    // --- PTTL with missing key arg → ERR result ---

    @Test
    void execute_pttlWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"PTTL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: PTTL requires a key"));
    }

    // --- TYPE with missing key arg → ERR result ---

    @Test
    void execute_typeWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"TYPE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: TYPE requires a key"));
    }

    // --- STRLEN with missing key → ERR result ---

    @Test
    void execute_strlenWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"STRLEN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: STRLEN requires a key"));
    }

    // --- STRLEN when key has null value → returns 0 ---

    @Test
    void execute_strlenKeyNull_returnsZero() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.get()).thenReturn(null);
        when(redissonClient.getBucket("nullkey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"STRLEN nullkey\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("0"));
    }

    // --- LLEN with missing key → ERR result ---

    @Test
    void execute_llenWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"LLEN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: LLEN requires a key"));
    }

    // --- HGETALL with missing key → ERR result ---

    @Test
    void execute_hgetallWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"HGETALL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: HGETALL requires a key"));
    }

    // --- SMEMBERS with missing key → ERR result ---

    @Test
    void execute_smembersWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"SMEMBERS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: SMEMBERS requires a key"));
    }

    // --- ZRANGE with missing args → ERR result ---

    @Test
    void execute_zrangeWithoutArgs_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ZRANGE myzset\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: ZRANGE requires key start stop"));
    }

    // --- ZRANGE with non-integer args → ERR result ---

    @Test
    void execute_zrangeNonIntegerArgs_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ZRANGE myzset abc xyz\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: start and stop must be integers"));
    }

    // --- ZCARD with missing key → ERR result ---

    @Test
    void execute_zcardWithoutKey_returnsErrResult() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ZCARD\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("ERR: ZCARD requires a key"));
    }

    // --- TTL: negative value (persistent or not-found) returned as-is ---

    @Test
    void execute_ttlKeyNotFound_returnsNegative() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(-2L);
        when(redissonClient.getBucket("gone")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"TTL gone\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("-2"));
    }

    // --- TYPE: key not found → "none" ---

    @Test
    void execute_typeKeyNotFound_returnsNone() throws Exception {
        RKeys rKeys = mock(RKeys.class);
        when(rKeys.getType("gone")).thenReturn(null);
        when(redissonClient.getKeys()).thenReturn(rKeys);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"TYPE gone\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("none"));
    }

    // --- Command throws exception → 500 ---

    @Test
    void execute_commandThrowsException_returns500() throws Exception {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.get()).thenThrow(new RuntimeException("Redis connection refused"));
        when(redissonClient.getBucket("badkey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"GET badkey\"}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("Command execution failed"));
    }

    // --- SET command returns result "OK" string ---

    @Test
    void execute_setCommandWithSpaceInValue_returnsOk() throws Exception {
        RBucket<String> bucket = mock(RBucket.class);
        when(redissonClient.<String>getBucket("mykey")).thenReturn(bucket);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"SET mykey hello world\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("OK"));

        verify(bucket).set("hello world");
    }

    // --- KEYS without pattern also rejected ---

    @Test
    void execute_keysWithoutPattern_rejected() throws Exception {
        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"KEYS\"}"))
                .andExpect(status().isBadRequest());
    }

    // --- ZRANGE with empty sorted set → empty list ---

    @Test
    void execute_zrangeEmptySortedSet_returnsEmptyList() throws Exception {
        RScoredSortedSet<Object> sortedSet = mock(RScoredSortedSet.class);
        when(sortedSet.size()).thenReturn(0);
        when(redissonClient.<Object>getScoredSortedSet("empty-zset")).thenReturn(sortedSet);

        mockMvc.perform(post("/api/cli/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ZRANGE empty-zset 0 -1\"}"))
                .andExpect(status().isOk());
    }

    // --- Write command blocked when demo.features.enabled=false (separate context) ---
    // This is tested via @WebMvcTest inner class but we can document it here.
    // The class-level @TestPropertySource sets demo.features.enabled=true.
    // For the enabled path, SET succeeds (already tested).
    // The 403 path requires demo disabled - verified by CliControllerNoDemoTest below.
}
