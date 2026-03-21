import { apiFetch } from './client';

export interface CliResponse {
  command: string;
  result?: string;
  error?: string;
  executionMs: number;
  timestamp: number;
}

export const cliApi = {
  execute: (command: string) =>
    apiFetch<CliResponse>('/api/cli/execute', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
};
