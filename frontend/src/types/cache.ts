export interface CacheGetResponse {
  key: string;
  found: boolean;
  value: unknown;
}

export interface CacheSetRequest {
  value: unknown;
  ttl?: number;
}

export interface CacheBatchGetResponse {
  requested: number;
  found: number;
  results: Record<string, unknown>;
}

export interface CacheBatchSetEntry {
  key: string;
  value: unknown;
  ttl?: number;
}

export interface CacheDeleteResponse {
  key: string;
  deleted: boolean;
}

export interface CacheSetResponse {
  key: string;
  success: boolean;
  ttl: string;
}

export interface CacheBatchSetResponse {
  total: number;
  successful: number;
  failed: number;
}

export interface CacheSearchResponse {
  pattern: string;
  limit: number;
  count: number;
  keys: string[];
}

export interface CacheMetrics {
  operations: number;
  redisHits: number;
  fallbacks: number;
  errors: number;
  hitRate: number;
}
