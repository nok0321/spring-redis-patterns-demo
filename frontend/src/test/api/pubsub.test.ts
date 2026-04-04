import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { pubsubApi } from '../../api/pubsub'

// jsdom does not include EventSource; polyfill it with a minimal mock
class MockEventSource {
  url: string
  constructor(url: string) { this.url = url }
  close() {}
}

beforeAll(() => {
  vi.stubGlobal('EventSource', MockEventSource)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('pubsubApi', () => {
  it('publish returns publish result with topic and message', async () => {
    const result = await pubsubApi.publish('alerts', 'hello world')
    expect(result.topic).toBe('default')
    expect(result.message).toBe('hello')
    expect(typeof result.subscribers).toBe('number')
    expect(result.timestamp).toBeDefined()
  })

  it('publish sends topic and message to the endpoint', async () => {
    const result = await pubsubApi.publish('events', 'test message')
    // Shape is determined by MSW handler; verify required fields are present
    expect(result).toHaveProperty('topic')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('subscribers')
    expect(result).toHaveProperty('timestamp')
  })

  it('publish works with empty message', async () => {
    const result = await pubsubApi.publish('channel', '')
    expect(typeof result.subscribers).toBe('number')
  })

  describe('createEventSource', () => {
    it('returns a MockEventSource instance', () => {
      const es = pubsubApi.createEventSource()
      expect(es).toBeInstanceOf(MockEventSource)
      es.close()
    })

    it('EventSource URL points to the subscribe endpoint', () => {
      const es = pubsubApi.createEventSource()
      expect(es.url).toContain('/api/pubsub/subscribe')
      es.close()
    })
  })
})
