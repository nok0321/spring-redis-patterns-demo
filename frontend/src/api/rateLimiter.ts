import { apiFetch } from './client';
import type { RateLimiterStatus, FloodResult } from '../types/rateLimiter';

export const rateLimiterApi = {
  getStatus: () => apiFetch<RateLimiterStatus>('/api/rate-limiter/status'),

  flood: (workers: number, burstCount: number) =>
    apiFetch<FloodResult>('/api/rate-limiter/flood', {
      method: 'POST',
      body: JSON.stringify({ workers, burstCount }),
    }),
};
