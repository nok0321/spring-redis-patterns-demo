import { apiFetch } from './client';
import type {
  LockAcquireRequest, LockAcquireResponse,
  LockExecuteRequest, FencedLockRequest,
  LockStatusResponse, LockMetricsResponse,
  TransferRequest, TransferResponse,
  LockDemoRunRequest, LockDemoResponse,
} from '../types/locks';

export const locksApi = {
  checkStatus: (body: LockAcquireRequest) =>
    apiFetch<LockAcquireResponse>('/api/lock/check-status', {
      method: 'POST', body: JSON.stringify(body)
    }),

  acquireFenced: (body: FencedLockRequest) =>
    apiFetch<Record<string, unknown>>('/api/lock/acquire-fenced', {
      method: 'POST', body: JSON.stringify(body)
    }),

  execute: (body: LockExecuteRequest) =>
    apiFetch<Record<string, unknown>>('/api/lock/execute', {
      method: 'POST', body: JSON.stringify(body)
    }),

  status: (lockKey: string) =>
    apiFetch<LockStatusResponse>(`/api/lock/status?lockKey=${encodeURIComponent(lockKey)}`),

  metrics: () => apiFetch<LockMetricsResponse>('/api/lock/metrics'),

  transfer: (body: TransferRequest) =>
    apiFetch<TransferResponse>('/api/lock/transfer', {
      method: 'POST', body: JSON.stringify(body)
    }),

  runDemo: (body: LockDemoRunRequest) =>
    apiFetch<LockDemoResponse>('/api/lock/demo/run', {
      method: 'POST', body: JSON.stringify(body)
    }),
};
