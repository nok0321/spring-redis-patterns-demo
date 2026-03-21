export interface RateLimiterStatus {
  availablePermissions: number;
  numberOfWaitingThreads: number;
  cyclePeriodMs: number;
  limitForPeriod: number;
  timestamp: number;
}

export interface FloodEvent {
  workerId: number;
  permitted: boolean;
  relativeMs: number;
}

export interface FloodResult {
  requested: number;
  permitted: number;
  rejected: number;
  events: FloodEvent[];
  timestamp: number;
}
