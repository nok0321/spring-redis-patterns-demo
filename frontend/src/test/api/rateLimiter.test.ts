import { describe, it, expect } from 'vitest'
import { rateLimiterApi } from '../../api/rateLimiter'

describe('rateLimiterApi', () => {
  it('getStatus returns current rate limiter status', async () => {
    const result = await rateLimiterApi.getStatus()
    expect(typeof result.availablePermissions).toBe('number')
    expect(typeof result.numberOfWaitingThreads).toBe('number')
    expect(typeof result.cyclePeriodMs).toBe('number')
    expect(typeof result.limitForPeriod).toBe('number')
    expect(result.timestamp).toBeDefined()
  })

  it('getStatus returns sensible default values', async () => {
    const result = await rateLimiterApi.getStatus()
    expect(result.availablePermissions).toBe(8)
    expect(result.limitForPeriod).toBe(10)
    expect(result.cyclePeriodMs).toBe(1000)
    expect(result.numberOfWaitingThreads).toBe(0)
  })

  it('flood returns request/permit/reject counts', async () => {
    const result = await rateLimiterApi.flood(3, 5)
    expect(result.requested).toBe(10)
    expect(result.permitted).toBe(7)
    expect(result.rejected).toBe(3)
    expect(Array.isArray(result.events)).toBe(true)
    expect(result.timestamp).toBeDefined()
  })

  it('flood accepts different worker and burst counts', async () => {
    const result = await rateLimiterApi.flood(5, 10)
    expect(result).toHaveProperty('requested')
    expect(result).toHaveProperty('permitted')
    expect(result).toHaveProperty('rejected')
  })

  it('flood result has events array', async () => {
    const result = await rateLimiterApi.flood(1, 3)
    expect(Array.isArray(result.events)).toBe(true)
  })

  it('permitted + rejected equals requested', async () => {
    const result = await rateLimiterApi.flood(2, 5)
    expect(result.permitted + result.rejected).toBe(result.requested)
  })
})
