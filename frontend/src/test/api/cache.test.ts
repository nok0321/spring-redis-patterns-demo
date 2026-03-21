import { describe, it, expect } from 'vitest'
import { cacheApi } from '../../api/cache'

describe('cacheApi', () => {
  it('searchKeys calls correct URL', async () => {
    const result = await cacheApi.searchKeys('demo:*', 50)
    expect(result.count).toBeDefined()
    expect(result.keys).toBeDefined()
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

  it('delete uses DELETE method', async () => {
    const result = await cacheApi.delete('demo:greeting')
    expect(result.deleted).toBe(true)
  })

  it('metrics returns cache metrics', async () => {
    const result = await cacheApi.metrics()
    expect(result.operations).toBeDefined()
    expect(result.hitRate).toBeDefined()
  })

  it('getTyped returns typed value', async () => {
    const result = await cacheApi.getTyped('demo:greeting')
    expect(result.type).toBeDefined()
    expect(result.value).toBeDefined()
  })
})
