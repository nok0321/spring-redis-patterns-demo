import { apiFetch } from './client';
import type { SagaResult } from '../types/transaction';

export const transactionApi = {
  runSaga: () =>
    apiFetch<SagaResult>('/api/transaction/saga', { method: 'POST' }),

  runSagaFail: () =>
    apiFetch<SagaResult>('/api/transaction/saga-fail', { method: 'POST' }),
};
