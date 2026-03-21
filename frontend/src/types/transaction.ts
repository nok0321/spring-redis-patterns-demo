export interface SagaStep {
  name: string;
  status: 'SUCCESS' | 'FAILED' | 'COMPENSATED';
  durationMs: number;
  detail: string;
}

export interface SagaResult {
  steps: SagaStep[];
  compensationSteps?: SagaStep[];
  overallStatus: 'SUCCESS' | 'FAILED' | 'COMPENSATED';
  timestamp: number;
}
