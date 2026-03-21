package com.example.cache.util;

import java.util.List;
import java.util.Map;

/**
 * 文字列型名から Java クラスへの共通変換ユーティリティ
 */
public final class TypeResolver {

    private TypeResolver() {}

    public static Class<?> fromString(String type) {
        if (type == null) {
            return Object.class;
        }
        return switch (type.toLowerCase()) {
            case "string"        -> String.class;
            case "integer", "int" -> Integer.class;
            case "long"          -> Long.class;
            case "double"        -> Double.class;
            case "boolean", "bool" -> Boolean.class;
            case "map"           -> Map.class;
            case "list"          -> List.class;
            default              -> Object.class;
        };
    }
}
