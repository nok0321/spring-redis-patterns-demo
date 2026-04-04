import { describe, it, expect } from 'vitest'
import { cacheApi } from '../../api/cache'

describe('cacheApi', () => {
  it('searchKeys calls correct URL', async () => {
    const result = await cacheApi.searchKeys('demo:*', 50)
    expect(result.count).toBeDefined()
    expect(result.keys).toBeDefined()
  })

  it('searchKeys uses default pattern and limit when not specified', async () => {
    const result = await cacheApi.searchKeys()
    expect(result.pattern).toBe('*')
    expect(result.limit).toBe(100)
  })

  it('batchGet passes keys as query param', async () => {
    const result = await cacheApi.batchGet(['demo:greeting', 'demo:counter'])
    expect(result.results).toBeDefined()
    expect(result.requested).toBeDefined()
  })

  it('set posts to correct URL', async () => {
    const result = await cacheApi.set('demo:greeting', { value: 'Hello', ttl: 3600 })
    expect(result.success).toBe(true)
  })

  it('set returns key and ttl', async () => {
    const result = await cacheApi.set('demo:greeting', { value: 'Hello' })
    expect(result.key).toBe('demo:greeting')
    expect(result.ttl).toBeDefined()
  })

  it('delete uses DELETE method', async () => {
    const result = await cacheApi.delete('demo:greeting')
    expect(result.deleted).toBe(true)
  })

  it('delete returns the deleted key', async () => {
    const result = await cacheApi.delete('demo:greeting')
    expect(result.key).toBe('demo:greeting')
  })

  it('metrics returns cache metrics', async () => {
    const result = await cacheApi.metrics()
    expect(result.operations).toBeDefined()
    expect(result.hitRate).toBeDefined()
  })

  it('metrics returns all expected fields', async () => {
    const result = await cacheApi.metrics()
    expect(result.operations).toBe(100)
    expect(result.redisHits).toBe(75)
    expect(result.fallbacks).toBe(2)
    expect(result.errors).toBe(1)
    expect(result.hitRate).toBe(75)
  })

  it('getTyped returns typed value', async () => {
    const result = await cacheApi.getTyped('demo:greeting')
    expect(result.type).toBeDefined()
    expect(result.value).toBeDefined()
  })

  it('getTyped returns key field', async () => {
    const result = await cacheApi.getTyped('demo:greeting')
    expect(result.key).toBe('demo:greeting')
  })

  it('get returns key, found, and value fields', async () => {
    const result = await cacheApi.get('demo:greeting')
    expect(result.key).toBe('demo:greeting')
    expect(result.found).toBe(true)
    expect(result.value).toBe('test-value')
  })

  it('get with type query param is accepted', async () => {
    const result = await cacheApi.get('demo:greeting', 'STRING')
    expect(result.found).toBe(true)
  })

  it('simulateError enables error simulation', async () => {
    const result = await cacheApi.simulateError(true)
    expect(result.simulationEnabled).toBe(true)
    expect(result.timestamp).toBeDefined()
  })

  it('simulateError can also disable simulation', async () => {
    const result = await cacheApi.simulateError(false)
    expect(result).toHaveProperty('simulationEnabled')
  })

  it('resetCircuitBreaker returns reset state', async () => {
    const result = await cacheApi.resetCircuitBreaker()
    expect(result.reset).toBe(true)
    expect(result.state).toBe('CLOSED')
    expect(result.timestamp).toBeDefined()
  })

  it('getTtlBatch returns TTL results for each key', async () => {
    const result = await cacheApi.getTtlBatch(['demo:greeting', 'demo:counter'])
    expect(result.results).toBeDefined()
    expect(result.results['demo:greeting']).toHaveProperty('ttlMs')
    expect(result.results['demo:greeting']).toHaveProperty('persistent')
  })

  it('batchSet returns success counts', async () => {
    const result = await cacheApi.batchSet([
      { key: 'demo:a', value: '1', ttl: 60 },
      { key: 'demo:b', value: '2', ttl: 60 },
    ])
    expect(result.total).toBeDefined()
    expect(result.successful).toBeDefined()
    expect(result.failed).toBeDefined()
  })

  it('warmup returns status and key count', async () => {
    const result = await cacheApi.warmup(['demo:greeting', 'demo:counter', 'demo:user:alice'])
    expect(result.status).toBe('DONE')
    expect(result.keys).toBe(3)
  })

  it('getType returns key and type', async () => {
    const result = await cacheApi.getType('demo:greeting')
    expect(result.key).toBe('demo:greeting')
    expect(result.type).toBeDefined()
  })
})
