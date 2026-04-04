package com.example.cache.util;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TypeResolverTest {

    @Test
    void fromString_null_returnsObjectClass() {
        assertThat(TypeResolver.fromString(null)).isEqualTo(Object.class);
    }

    @Test
    void fromString_string_returnsStringClass() {
        assertThat(TypeResolver.fromString("string")).isEqualTo(String.class);
        assertThat(TypeResolver.fromString("STRING")).isEqualTo(String.class);
    }

    @Test
    void fromString_integer_returnsIntegerClass() {
        assertThat(TypeResolver.fromString("integer")).isEqualTo(Integer.class);
    }

    @Test
    void fromString_int_returnsIntegerClass() {
        assertThat(TypeResolver.fromString("int")).isEqualTo(Integer.class);
    }

    @Test
    void fromString_long_returnsLongClass() {
        assertThat(TypeResolver.fromString("long")).isEqualTo(Long.class);
        assertThat(TypeResolver.fromString("LONG")).isEqualTo(Long.class);
    }

    @Test
    void fromString_double_returnsDoubleClass() {
        assertThat(TypeResolver.fromString("double")).isEqualTo(Double.class);
    }

    @Test
    void fromString_boolean_returnsBooleanClass() {
        assertThat(TypeResolver.fromString("boolean")).isEqualTo(Boolean.class);
    }

    @Test
    void fromString_bool_returnsBooleanClass() {
        assertThat(TypeResolver.fromString("bool")).isEqualTo(Boolean.class);
    }

    @Test
    void fromString_map_returnsMapClass() {
        assertThat(TypeResolver.fromString("map")).isEqualTo(Map.class);
        assertThat(TypeResolver.fromString("MAP")).isEqualTo(Map.class);
    }

    @Test
    void fromString_list_returnsListClass() {
        assertThat(TypeResolver.fromString("list")).isEqualTo(List.class);
    }

    @Test
    void fromString_unknown_returnsObjectClass() {
        assertThat(TypeResolver.fromString("unknown")).isEqualTo(Object.class);
        assertThat(TypeResolver.fromString("object")).isEqualTo(Object.class);
        assertThat(TypeResolver.fromString("")).isEqualTo(Object.class);
        assertThat(TypeResolver.fromString("float")).isEqualTo(Object.class);
    }
}
