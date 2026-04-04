import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, getBaseUrl, setBaseUrl, getApiKey, setApiKey } from '../../api/client'

describe('getBaseUrl / setBaseUrl', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('getBaseUrl returns empty string when not set', () => {
    expect(getBaseUrl()).toBe('')
  })

  it('setBaseUrl stores value and getBaseUrl returns it', () => {
    setBaseUrl('http://localhost:8080')
    expect(getBaseUrl()).toBe('http://localhost:8080')
  })

  it('setBaseUrl strips trailing slash', () => {
    setBaseUrl('http://localhost:8080/')
    expect(getBaseUrl()).toBe('http://localhost:8080')
  })
})

describe('getApiKey / setApiKey', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('getApiKey returns empty string when not set', () => {
    expect(getApiKey()).toBe('')
  })

  it('setApiKey stores value and getApiKey returns it', () => {
    setApiKey('my-secret-key')
    expect(getApiKey()).toBe('my-secret-key')
  })
})

describe('apiFetch', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('returns parsed JSON on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await apiFetch<{ data: string }>('/test')
    expect(result).toEqual({ data: 'test' })
  })

  it('sends X-API-Key header when API key is set', async () => {
    setApiKey('test-api-key')
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('/test')

    const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>
    expect(calledHeaders['X-API-Key']).toBe('test-api-key')
  })

  it('does not send X-API-Key header when no API key is set', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('/test')

    const calledHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>
    expect(calledHeaders['X-API-Key']).toBeUndefined()
  })

  it('throws error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    await expect(apiFetch('/test')).rejects.toThrow('接続できません')
  })

  it('throws error on 4xx response with error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Key is required', timestamp: Date.now() }),
    }))

    await expect(apiFetch('/api/cache/get/')).rejects.toThrow('Key is required')
  })

  it('throws HTTP status error when response body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    }))

    await expect(apiFetch('/test')).rejects.toThrow('HTTP 500')
  })
})
