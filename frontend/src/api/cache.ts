import { apiFetch } from './client';
import type {
  CacheGetResponse, CacheSetRequest, CacheBatchGetResponse,
  CacheBatchSetEntry, CacheDeleteResponse, CacheMetrics,
} from '../types/cache';

export const cacheApi = {
  get: (key: string, type?: string) =>
    apiFetch<CacheGetResponse>(
      `/api/cache/get/${encodeURIComponent(key)}${type ? `?type=${type}` : ''}`
    ),

  set: (key: string, body: CacheSetRequest) =>
    apiFetch<{ key: string; success: boolean; ttl: string }>(
      `/api/cache/set/${encodeURIComponent(key)}`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  batchGet: (keys: string[]) =>
    apiFetch<CacheBatchGetResponse>(
      `/api/cache/batch?keys=${keys.map(encodeURIComponent).join(',')}`
    ),

  batchSet: (entries: CacheBatchSetEntry[]) =>
    apiFetch<{ total: number; successful: number; failed: number }>(
      '/api/cache/batch',
      { method: 'POST', body: JSON.stringify(entries) }
    ),

  delete: (key: string) =>
    apiFetch<CacheDeleteResponse>(
      `/api/cache/delete/${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    ),

  warmup: (keys: string[]) =>
    apiFetch<{ status: string; keys: number }>(
      '/api/cache/warmup',
      { method: 'POST', body: JSON.stringify(keys) }
    ),

  searchKeys: (pattern = '*', limit = 100) =>
    apiFetch<{ pattern: string; limit: number; count: number; keys: string[] }>(
      `/api/cache/search?pattern=${encodeURIComponent(pattern)}&limit=${limit}`
    ),

  metrics: () => apiFetch<CacheMetrics>('/api/cache/metrics'),

  simulateError: (enabled: boolean) =>
    apiFetch<{ simulationEnabled: boolean; timestamp: number }>(
      '/api/cache/simulate-error',
      { method: 'POST', body: JSON.stringify({ enabled }) }
    ),

  resetCircuitBreaker: () =>
    apiFetch<{ reset: boolean; state: string; timestamp: number }>(
      '/api/cache/reset-circuit-breaker',
      { method: 'POST' }
    ),

  getTtlBatch: (keys: string[]) =>
    apiFetch<{ results: Record<string, { ttlMs: number; persistent: boolean }> }>(
      `/api/cache/ttl-batch?keys=${keys.map(encodeURIComponent).join(',')}`
    ),

  getType: (key: string) =>
    apiFetch<{ key: string; type: string }>(
      `/api/cache/type/${encodeURIComponent(key)}`
    ),

  getTyped: (key: string) =>
    apiFetch<{ key: string; type: string; value: unknown }>(
      `/api/cache/get-typed/${encodeURIComponent(key)}`
    ),
};
