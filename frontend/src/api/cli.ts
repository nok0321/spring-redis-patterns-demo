import { apiFetch } from './client';
import type { CliResponse } from '../types/cli';

export type { CliResponse };

export const cliApi = {
  execute: (command: string) =>
    apiFetch<CliResponse>('/api/cli/execute', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
};
