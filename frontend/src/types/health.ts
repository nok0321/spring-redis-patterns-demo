export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface HealthResponse {
  timestamp: string;
  service: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  redis?: {
    status: 'UP' | 'DOWN' | 'NOT_INITIALIZED';
    initialized: boolean;
    message?: string;
  };
  circuitBreakers?: Record<string, CircuitBreakerMetrics>;
}

export interface CircuitBreakerMetrics {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureRate: number;
  slowCallRate: number;
  numberOfSuccessfulCalls: number;
  numberOfFailedCalls: number;
  numberOfSlowCalls: number;
}
