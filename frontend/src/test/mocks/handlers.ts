import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/health', () =>
    HttpResponse.json({
      status: 'UP',
      service: 'Cache Service',
      timestamp: new Date().toISOString(),
      redis: { status: 'UP', initialized: true },
      circuitBreakers: {
        'cache-operations': { state: 'CLOSED', failureRate: 0, slowCallRate: 0,
          numberOfSuccessfulCalls: 10, numberOfFailedCalls: 0, numberOfSlowCalls: 0 }
      }
    })
  ),

  http.get('/api/cache/search', ({ request }) => {
    const url = new URL(request.url)
    const pattern = url.searchParams.get('pattern') ?? '*'
    return HttpResponse.json({
      pattern,
      limit: 100,
      count: 3,
      keys: ['demo:greeting', 'demo:counter', 'demo:user:alice']
    })
  }),

  http.get('/api/cache/batch', () =>
    HttpResponse.json({
      requested: 3,
      found: 3,
      results: {
        'demo:greeting': 'Hello, Redis!',
        'demo:counter': 42,
        'demo:user:alice': { name: 'Alice', role: 'admin' }
      }
    })
  ),

  http.get('/api/cache/get/:key', ({ params }) =>
    HttpResponse.json({
      key: params.key,
      found: true,
      value: 'test-value'
    })
  ),

  http.get('/api/cache/get-typed/:key', ({ params }) =>
    HttpResponse.json({
      key: params.key,
      type: 'OBJECT',
      value: 'typed-value'
    })
  ),

  http.get('/api/cache/ttl-batch', () =>
    HttpResponse.json({
      results: {
        'demo:greeting': { ttlMs: 60000, persistent: false },
        'demo:counter': { ttlMs: -1, persistent: true },
        'demo:user:alice': { ttlMs: 86400000, persistent: false }
      }
    })
  ),

  http.post('/api/cache/set/:key', () =>
    HttpResponse.json({ key: 'demo:greeting', success: true, ttl: 'PT1H' })
  ),

  http.delete('/api/cache/delete/:key', () =>
    HttpResponse.json({ key: 'demo:greeting', deleted: true })
  ),

  http.get('/api/cache/metrics', () =>
    HttpResponse.json({
      operations: 100,
      redisHits: 75,
      fallbacks: 2,
      errors: 1,
      hitRate: 75
    })
  ),

  http.post('/api/cache/simulate-error', () =>
    HttpResponse.json({ simulationEnabled: true, timestamp: Date.now() })
  ),

  http.post('/api/cache/reset-circuit-breaker', () =>
    HttpResponse.json({ reset: true, state: 'CLOSED', timestamp: Date.now() })
  ),

  http.post('/api/pubsub/publish', () =>
    HttpResponse.json({ topic: 'default', message: 'hello', subscribers: 1, timestamp: Date.now() })
  ),

  http.post('/api/rate-limiter/flood', () =>
    HttpResponse.json({ requested: 10, permitted: 7, rejected: 3, events: [], timestamp: Date.now() })
  ),

  http.post('/api/transaction/saga', () =>
    HttpResponse.json({
      steps: [
        { name: 'ステップ1', status: 'SUCCESS', durationMs: 5, detail: 'ok' }
      ],
      overallStatus: 'SUCCESS',
      timestamp: Date.now()
    })
  ),

  http.post('/api/cli/execute', () =>
    HttpResponse.json({ command: 'GET mykey', result: 'OK', executionMs: 1, timestamp: Date.now() })
  ),

  http.get('/api/lock/metrics', () =>
    HttpResponse.json({
      locks: {
        'my-lock': {
          attempts: 5, acquisitions: 4, timeouts: 1, releases: 4,
          operationSuccesses: 3, operationFailures: 1,
        },
      },
      timestamp: Date.now(),
    })
  ),

  http.post('/api/lock/check-status', () =>
    HttpResponse.json({
      lockKey: 'my-lock',
      canAcquire: true,
      currentlyLocked: false,
      lockType: 'standard',
      timestamp: Date.now(),
    })
  ),

  http.post('/api/lock/acquire-fenced', () =>
    HttpResponse.json({
      lockKey: 'my-lock',
      acquired: true,
      fenceToken: 42,
      timestamp: Date.now(),
    })
  ),

  http.post('/api/lock/execute', () =>
    HttpResponse.json({
      lockKey: 'my-lock',
      success: true,
      result: 'executed',
      timestamp: Date.now(),
    })
  ),

  http.get('/api/lock/status', () =>
    HttpResponse.json({
      lockKey: 'my-lock',
      locked: false,
      timestamp: Date.now(),
    })
  ),

  http.post('/api/lock/transfer', () =>
    HttpResponse.json({
      transferId: 'txn-001',
      success: true,
      fromKey: 'account:A',
      toKey: 'account:B',
      amount: 100,
      timestamp: Date.now(),
    })
  ),

  http.post('/api/lock/demo/run', () =>
    HttpResponse.json({
      withoutLock: {
        initialValue: 10, expectedFinal: 6, actualFinal: 8,
        lostUpdates: 2, correct: false,
        events: [
          { workerId: 1, step: 'READ', value: 10, relativeMs: 0 },
          { workerId: 1, step: 'WRITE', value: 9, relativeMs: 5 },
        ],
      },
      withLock: {
        initialValue: 10, expectedFinal: 6, actualFinal: 6,
        lostUpdates: 0, correct: true,
        events: [
          { workerId: 1, step: 'LOCK_ACQUIRED', value: 10, relativeMs: 0 },
          { workerId: 1, step: 'WRITE', value: 9, relativeMs: 5 },
          { workerId: 1, step: 'LOCK_RELEASED', value: 9, relativeMs: 10 },
        ],
      },
      timestamp: Date.now(),
    })
  ),

  http.get('/api/rate-limiter/status', () =>
    HttpResponse.json({
      availablePermissions: 8,
      numberOfWaitingThreads: 0,
      cyclePeriodMs: 1000,
      limitForPeriod: 10,
      timestamp: Date.now(),
    })
  ),

  http.post('/api/transaction/saga-fail', () =>
    HttpResponse.json({
      steps: [
        { name: 'ステップ1', status: 'SUCCESS', durationMs: 5, detail: 'ok' },
        { name: 'ステップ2', status: 'FAILED', durationMs: 3, detail: 'error' },
      ],
      compensationSteps: [
        { name: 'ステップ1補償', status: 'COMPENSATED', durationMs: 2, detail: 'rolled back' },
      ],
      overallStatus: 'COMPENSATED',
      timestamp: Date.now(),
    })
  ),

  http.post('/api/cache/batch', () =>
    HttpResponse.json({ total: 2, successful: 2, failed: 0 })
  ),

  http.post('/api/cache/warmup', () =>
    HttpResponse.json({ status: 'DONE', keys: 3 })
  ),

  http.get('/api/cache/type/:key', () =>
    HttpResponse.json({ key: 'demo:greeting', type: 'string' })
  ),
]
