export interface CliResponse {
  command: string;
  result?: string;
  error?: string;
  executionMs: number;
  timestamp: number;
}
