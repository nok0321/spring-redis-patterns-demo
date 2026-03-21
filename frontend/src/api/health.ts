import { apiFetch } from './client';
import type { HealthResponse } from '../types/health';

export const healthApi = {
  get: () => apiFetch<HealthResponse>('/health'),
};
