import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToast } from '../../hooks/useToast'

describe('useToast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts with empty toasts', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toasts).toHaveLength(0)
  })

  it('addToast adds a toast', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.addToast('Hello!', 'success')
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Hello!')
    expect(result.current.toasts[0].variant).toBe('success')
  })

  it('toast auto-removes after 3 seconds', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.addToast('Temporary', 'info')
    })
    expect(result.current.toasts).toHaveLength(1)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('multiple toasts coexist', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.addToast('First', 'info')
      result.current.addToast('Second', 'error')
      result.current.addToast('Third', 'success')
    })

    expect(result.current.toasts).toHaveLength(3)
  })

  it('default variant is info', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.addToast('Default variant')
    })

    expect(result.current.toasts[0].variant).toBe('info')
  })
})
