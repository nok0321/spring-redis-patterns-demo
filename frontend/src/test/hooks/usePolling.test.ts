import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePolling } from '../../hooks/usePolling'

describe('usePolling', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fetches immediately on mount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'test' })
    renderHook(() => usePolling({ fetcher, interval: 1000 }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sets data after successful fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'hello' })
    const { result } = renderHook(() => usePolling({ fetcher, interval: 1000 }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.data).toEqual({ data: 'hello' })
    expect(result.current.isLoading).toBe(false)
  })

  it('sets error on fetch failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('fetch failed'))
    const { result } = renderHook(() => usePolling({ fetcher, interval: 1000 }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.error).toBe('fetch failed')
  })

  it('polls at interval', async () => {
    const fetcher = vi.fn().mockResolvedValue({})
    renderHook(() => usePolling({ fetcher, interval: 1000 }))

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not fetch when enabled is false', async () => {
    const fetcher = vi.fn().mockResolvedValue({})
    renderHook(() => usePolling({ fetcher, interval: 1000, enabled: false }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refetch triggers immediate fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({})
    const { result } = renderHook(() => usePolling({ fetcher, interval: 5000 }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      result.current.refetch()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('clears interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const fetcher = vi.fn().mockResolvedValue({})
    const { unmount } = renderHook(() => usePolling({ fetcher, interval: 1000 }))

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
