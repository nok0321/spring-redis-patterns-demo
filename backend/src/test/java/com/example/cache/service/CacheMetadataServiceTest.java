package com.example.cache.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutorService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@SuppressWarnings({"unchecked", "rawtypes"}) // Mockito.mock(RBucket.class) returns raw type; safe in test stubs
class CacheMetadataServiceTest {

    @Mock
    RedissonClient redissonClient;

    @Mock
    ExecutorService virtualExecutor;

    CacheMetadataService service;

    @BeforeEach
    void setUp() {
        service = new CacheMetadataService(redissonClient, virtualExecutor);
    }

    // ----------------------------------------------------------------
    // getTtl
    // ----------------------------------------------------------------

    @Test
    void getTtl_existingKeyWithTtl_returnsTtlInfo() {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(60000L);
        when(redissonClient.getBucket("k1")).thenReturn(bucket);

        Optional<CacheMetadataService.TtlInfo> result = service.getTtl("k1");

        assertThat(result).isPresent();
        CacheMetadataService.TtlInfo info = result.get();
        assertThat(info.ttlMs()).isEqualTo(60000L);
        assertThat(info.ttlSeconds()).isEqualTo(60L);
        assertThat(info.persistent()).isFalse();
    }

    @Test
    void getTtl_persistentKey_returnsPersistentTtlInfo() {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(-1L);
        when(redissonClient.getBucket("pkey")).thenReturn(bucket);

        Optional<CacheMetadataService.TtlInfo> result = service.getTtl("pkey");

        assertThat(result).isPresent();
        CacheMetadataService.TtlInfo info = result.get();
        assertThat(info.ttlMs()).isEqualTo(-1L);
        assertThat(info.ttlSeconds()).isEqualTo(-1L);
        assertThat(info.persistent()).isTrue();
    }

    @Test
    void getTtl_missingKey_returnsEmpty() {
        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.remainTimeToLive()).thenReturn(-2L);
        when(redissonClient.getBucket("gone")).thenReturn(bucket);

        Optional<CacheMetadataService.TtlInfo> result = service.getTtl("gone");

        assertThat(result).isEmpty();
    }

    // ----------------------------------------------------------------
    // getKeyType
    // ----------------------------------------------------------------

    @Test
    void getKeyType_objectType_returnsOBJECT() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("strkey")).thenReturn(RType.OBJECT);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<String> result = service.getKeyType("strkey");

        assertThat(result).hasValue("OBJECT");
    }

    @Test
    void getKeyType_mapType_returnsMAP() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("mapkey")).thenReturn(RType.MAP);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<String> result = service.getKeyType("mapkey");

        assertThat(result).hasValue("MAP");
    }

    @Test
    void getKeyType_listType_returnsLIST() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("listkey")).thenReturn(RType.LIST);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<String> result = service.getKeyType("listkey");

        assertThat(result).hasValue("LIST");
    }

    @Test
    void getKeyType_setType_returnsSET() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("setkey")).thenReturn(RType.SET);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<String> result = service.getKeyType("setkey");

        assertThat(result).hasValue("SET");
    }

    @Test
    void getKeyType_zsetType_returnsZSET() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("zsetkey")).thenReturn(RType.ZSET);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<String> result = service.getKeyType("zsetkey");

        assertThat(result).hasValue("ZSET");
    }

    @Test
    void getKeyType_streamType_returnsSTREAM() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("streamkey")).thenReturn(RType.STREAM);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<String> result = service.getKeyType("streamkey");

        assertThat(result).hasValue("STREAM");
    }

    @Test
    void getKeyType_keyNotExist_returnsEmpty() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("gone")).thenReturn(null);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<String> result = service.getKeyType("gone");

        assertThat(result).isEmpty();
    }

    // ----------------------------------------------------------------
    // getTypedValue
    // ----------------------------------------------------------------

    @Test
    void getTypedValue_stringType_returnsBucketValue() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("strkey")).thenReturn(RType.OBJECT);
        when(redissonClient.getKeys()).thenReturn(keys);

        RBucket<Object> bucket = mock(RBucket.class);
        when(bucket.get()).thenReturn("hello world");
        when(redissonClient.getBucket("strkey")).thenReturn(bucket);

        Optional<CacheMetadataService.TypedValue> result = service.getTypedValue("strkey");

        assertThat(result).isPresent();
        assertThat(result.get().key()).isEqualTo("strkey");
        assertThat(result.get().type()).isEqualTo("OBJECT");
        assertThat(result.get().value()).isEqualTo("hello world");
    }

    @Test
    void getTypedValue_mapType_returnsMapContents() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("mapkey")).thenReturn(RType.MAP);
        when(redissonClient.getKeys()).thenReturn(keys);

        RMap<Object, Object> map = mock(RMap.class);
        when(map.readAllMap()).thenReturn(Map.of("f1", "v1"));
        when(redissonClient.getMap("mapkey")).thenReturn(map);

        Optional<CacheMetadataService.TypedValue> result = service.getTypedValue("mapkey");

        assertThat(result).isPresent();
        assertThat(result.get().type()).isEqualTo("MAP");
        assertThat(result.get().value()).isInstanceOf(Map.class);
    }

    @Test
    void getTypedValue_listType_returnsListContents() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("listkey")).thenReturn(RType.LIST);
        when(redissonClient.getKeys()).thenReturn(keys);

        RList<Object> list = mock(RList.class);
        when(list.readAll()).thenReturn(List.of("a", "b", "c"));
        when(redissonClient.getList("listkey")).thenReturn(list);

        Optional<CacheMetadataService.TypedValue> result = service.getTypedValue("listkey");

        assertThat(result).isPresent();
        assertThat(result.get().type()).isEqualTo("LIST");
        assertThat(result.get().value()).isInstanceOf(List.class);
    }

    @Test
    void getTypedValue_setType_returnsSetContents() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("setkey")).thenReturn(RType.SET);
        when(redissonClient.getKeys()).thenReturn(keys);

        RSet<Object> rset = mock(RSet.class);
        when(rset.readAll()).thenReturn(Set.of("x", "y"));
        when(redissonClient.getSet("setkey")).thenReturn(rset);

        Optional<CacheMetadataService.TypedValue> result = service.getTypedValue("setkey");

        assertThat(result).isPresent();
        assertThat(result.get().type()).isEqualTo("SET");
        assertThat(result.get().value()).isInstanceOf(Set.class);
    }

    @Test
    void getTypedValue_keyNotExist_returnsEmpty() {
        RKeys keys = mock(RKeys.class);
        when(keys.getType("gone")).thenReturn(null);
        when(redissonClient.getKeys()).thenReturn(keys);

        Optional<CacheMetadataService.TypedValue> result = service.getTypedValue("gone");

        assertThat(result).isEmpty();
    }
}
