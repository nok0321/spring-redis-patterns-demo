import { describe, it, expect } from 'vitest'
import { locksApi } from '../../api/locks'

describe('locksApi', () => {
  it('checkStatus returns lock availability info', async () => {
    const result = await locksApi.checkStatus({ lockKey: 'my-lock' })
    expect(result.lockKey).toBe('my-lock')
    expect(typeof result.canAcquire).toBe('boolean')
    expect(typeof result.currentlyLocked).toBe('boolean')
    expect(result.lockType).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('checkStatus accepts full options', async () => {
    const result = await locksApi.checkStatus({
      lockKey: 'my-lock',
      lockType: 'fair',
      waitTime: 5000,
      leaseTime: 30000,
    })
    expect(result.canAcquire).toBe(true)
  })

  it('acquireFenced returns acquisition result with fence token', async () => {
    const result = await locksApi.acquireFenced({ lockKey: 'my-lock', operation: 'fenced_cache_update' })
    expect(result).toHaveProperty('lockKey')
    expect(result).toHaveProperty('fenceToken')
  })

  it('execute returns success result', async () => {
    const result = await locksApi.execute({
      lockKey: 'my-lock',
      operation: 'cache_update',
      data: { value: 'test' },
    })
    expect(result).toHaveProperty('success')
  })

  it('status returns lock status for a key', async () => {
    const result = await locksApi.status('my-lock')
    expect(result.lockKey).toBe('my-lock')
    expect(typeof result.locked).toBe('boolean')
    expect(result.timestamp).toBeDefined()
  })

  it('metrics returns lock statistics', async () => {
    const result = await locksApi.metrics()
    expect(result.locks).toBeDefined()
    expect(result.timestamp).toBeDefined()
    expect(typeof result.locks).toBe('object')
  })

  it('metrics contains per-lock stats', async () => {
    const result = await locksApi.metrics()
    const lockStats = result.locks['my-lock']
    expect(lockStats).toBeDefined()
    expect(lockStats.attempts).toBe(5)
    expect(lockStats.acquisitions).toBe(4)
    expect(lockStats.timeouts).toBe(1)
  })

  it('transfer returns transfer result', async () => {
    const result = await locksApi.transfer({
      fromKey: 'account:A',
      toKey: 'account:B',
      amount: 100,
    })
    expect(result.transferId).toBe('txn-001')
    expect(result.success).toBe(true)
    expect(result.fromKey).toBe('account:A')
    expect(result.toKey).toBe('account:B')
    expect(result.amount).toBe(100)
    expect(result.timestamp).toBeDefined()
  })

  it('runDemo returns both lock and no-lock results', async () => {
    const result = await locksApi.runDemo({ workers: 4, initialValue: 10 })
    expect(result.withoutLock).toBeDefined()
    expect(result.withLock).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('runDemo withoutLock shows data loss', async () => {
    const result = await locksApi.runDemo({ workers: 4, initialValue: 10 })
    expect(result.withoutLock.correct).toBe(false)
    expect(result.withoutLock.lostUpdates).toBeGreaterThan(0)
    expect(result.withoutLock.events.length).toBeGreaterThan(0)
  })

  it('runDemo withLock shows correct result', async () => {
    const result = await locksApi.runDemo({ workers: 4, initialValue: 10 })
    expect(result.withLock.correct).toBe(true)
    expect(result.withLock.lostUpdates).toBe(0)
  })
})
