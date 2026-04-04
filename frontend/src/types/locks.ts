export type LockType = 'standard' | 'fair' | 'read' | 'write' | 'spin';

export type LockOperation =
  | 'cache_update' | 'cache_read' | 'batch_read' | 'atomic_increment';

export type FencedOperation =
  | 'fenced_cache_read' | 'fenced_cache_update'
  | 'fenced_critical_section' | 'fenced_atomic_increment'
  | 'fenced_conditional_update';

export interface LockAcquireRequest {
  lockKey: string;
  lockType?: LockType;
  waitTime?: number;
  leaseTime?: number;
}

export interface LockAcquireResponse {
  lockKey: string;
  canAcquire: boolean;
  currentlyLocked: boolean;
  lockType: string;
  timestamp: number;
}

export interface LockExecuteRequest {
  lockKey: string;
  operation: LockOperation;
  data: Record<string, unknown>;
}

export interface FencedLockRequest {
  lockKey: string;
  operation?: FencedOperation;
  data?: Record<string, unknown>;
}

export interface FencedLockResponse {
  lockKey: string;
  acquired: boolean;
  fencingToken: number | null;
  timestamp: number;
  [key: string]: unknown;
}

export interface LockExecuteResponse {
  [key: string]: unknown;
}

export interface LockStatusResponse {
  lockKey: string;
  locked: boolean;
  timestamp: number;
}

export interface LockStats {
  attempts: number;
  acquisitions: number;
  timeouts: number;
  releases: number;
  operationSuccesses: number;
  operationFailures: number;
}

export interface LockMetricsResponse {
  locks: Record<string, LockStats>;
  timestamp: number;
}

export interface TransferRequest {
  fromKey: string;
  toKey: string;
  amount: number;
}

export interface TransferResponse {
  transferId: string;
  success: boolean;
  fromKey: string;
  toKey: string;
  amount: number;
  timestamp: number;
}

// ---- 競合デモ ----
export type DemoStep = 'READ' | 'WRITE' | 'LOCK_WAITING' | 'LOCK_ACQUIRED' | 'LOCK_RELEASED';

export interface LockDemoEvent {
  workerId: number;
  step: DemoStep;
  value: number;
  relativeMs: number;
}

export interface LockDemoModeResult {
  initialValue: number;
  expectedFinal: number;
  actualFinal: number;
  lostUpdates: number;
  correct: boolean;
  events: LockDemoEvent[];
}

export interface LockDemoRunRequest {
  workers: number;
  initialValue: number;
}

export interface LockDemoResponse {
  withoutLock: LockDemoModeResult;
  withLock: LockDemoModeResult;
  timestamp: number;
}
