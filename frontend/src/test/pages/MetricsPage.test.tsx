import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MetricsPage } from '../../pages/MetricsPage'

// Mock APIs (usePolling calls these internally, but we mock usePolling directly)
vi.mock('../../api/cache', () => ({
  cacheApi: {
    metrics: vi.fn(),
  },
}))

vi.mock('../../api/locks', () => ({
  locksApi: {
    metrics: vi.fn(),
  },
}))

vi.mock('../../api/health', () => ({
  healthApi: {
    get: vi.fn(),
  },
}))

// Mock usePolling so we control returned data without running timers
const mockRefetchCache = vi.fn()
const mockRefetchLocks = vi.fn()
const mockRefetchHealth = vi.fn()

vi.mock('../../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}))

// Mock child panel components
vi.mock('../../components/metrics/CacheMetricsPanel', () => ({
  CacheMetricsPanel: () => <div data-testid="cache-metrics-panel" />,
}))

vi.mock('../../components/metrics/LockMetricsPanel', () => ({
  LockMetricsPanel: () => <div data-testid="lock-metrics-panel" />,
}))

vi.mock('../../components/metrics/CircuitBreakerTable', () => ({
  CircuitBreakerTable: () => <div data-testid="circuit-breaker-table" />,
}))

import { usePolling } from '../../hooks/usePolling'

const mockUsePolling = vi.mocked(usePolling)

function renderPage() {
  return render(
    <MemoryRouter>
      <MetricsPage />
    </MemoryRouter>
  )
}

describe('MetricsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // usePolling is called 3 times in sequence; return different refetch fns per call
    let callCount = 0
    mockUsePolling.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return { data: null, isLoading: false, error: null, refetch: mockRefetchCache }
      }
      if (callCount === 2) {
        return { data: null, isLoading: false, error: null, refetch: mockRefetchLocks }
      }
      return { data: null, isLoading: false, error: null, refetch: mockRefetchHealth }
    })
  })

  it('renders page heading "メトリクス"', () => {
    renderPage()
    expect(screen.getByText('メトリクス')).toBeInTheDocument()
  })

  it('renders CacheMetricsPanel', () => {
    renderPage()
    expect(screen.getByTestId('cache-metrics-panel')).toBeInTheDocument()
  })

  it('renders LockMetricsPanel', () => {
    renderPage()
    expect(screen.getByTestId('lock-metrics-panel')).toBeInTheDocument()
  })

  it('renders CircuitBreakerTable', () => {
    renderPage()
    expect(screen.getByTestId('circuit-breaker-table')).toBeInTheDocument()
  })

  it('renders refresh button', () => {
    renderPage()
    expect(screen.getByText('更新')).toBeInTheDocument()
  })

  it('renders CSV export button', () => {
    renderPage()
    expect(screen.getByText('CSV出力')).toBeInTheDocument()
  })

  it('calls all three refetch functions when refresh button is clicked', () => {
    renderPage()
    fireEvent.click(screen.getByText('更新'))
    expect(mockRefetchCache).toHaveBeenCalledTimes(1)
    expect(mockRefetchLocks).toHaveBeenCalledTimes(1)
    expect(mockRefetchHealth).toHaveBeenCalledTimes(1)
  })

  it('calls usePolling three times with 15000ms interval', () => {
    renderPage()
    expect(mockUsePolling).toHaveBeenCalledTimes(3)
    for (const call of mockUsePolling.mock.calls) {
      expect((call[0] as { interval: number }).interval).toBe(15000)
    }
  })
})
