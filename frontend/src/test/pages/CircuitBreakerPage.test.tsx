import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CircuitBreakerPage } from '../../pages/CircuitBreakerPage'
import type { HealthResponse } from '../../types/health'

// Mock APIs
vi.mock('../../api/cache', () => ({
  cacheApi: {
    simulateError: vi.fn(),
    resetCircuitBreaker: vi.fn(),
  },
}))

vi.mock('../../api/health', () => ({
  healthApi: {
    get: vi.fn(),
  },
}))

// Mock usePolling
vi.mock('../../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}))

// Mock CircuitBreakerStateDiagram
vi.mock('../../components/dashboard/CircuitBreakerStateDiagram', () => ({
  CircuitBreakerStateDiagram: ({
    state,
    failureRate,
    slowCallRate,
  }: {
    state: string
    failureRate: number
    slowCallRate: number
  }) => (
    <div
      data-testid="circuit-breaker-state-diagram"
      data-state={state}
      data-failure-rate={failureRate}
      data-slow-call-rate={slowCallRate}
    />
  ),
}))

// Mock recharts to avoid ResizeObserver and canvas issues in jsdom
vi.mock('recharts', () => ({
  RadialBarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="radial-bar-chart">{children}</div>
  ),
  RadialBar: () => <div data-testid="radial-bar" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

import { usePolling } from '../../hooks/usePolling'
import { cacheApi } from '../../api/cache'

const mockUsePolling = vi.mocked(usePolling)
const mockSimulateError = vi.mocked(cacheApi.simulateError)
const mockResetCircuitBreaker = vi.mocked(cacheApi.resetCircuitBreaker)

const makeHealthData = (
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED',
  failureRate = 0,
  slowCallRate = 0
): HealthResponse => ({
  timestamp: new Date().toISOString(),
  service: 'redis-app',
  status: 'UP',
  redis: { status: 'UP', initialized: true },
  circuitBreakers: {
    'cache-operations': {
      state,
      failureRate,
      slowCallRate,
      numberOfSuccessfulCalls: 10,
      numberOfFailedCalls: 0,
      numberOfSlowCalls: 0,
    },
  },
})

function renderPage() {
  return render(
    <MemoryRouter>
      <CircuitBreakerPage />
    </MemoryRouter>
  )
}

describe('CircuitBreakerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSimulateError.mockResolvedValue({ simulationEnabled: true, timestamp: Date.now() })
    mockResetCircuitBreaker.mockResolvedValue({
      reset: true,
      state: 'CLOSED',
      timestamp: Date.now(),
    })
    mockUsePolling.mockReturnValue({
      data: makeHealthData(),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('renders page heading', () => {
    renderPage()
    expect(screen.getByText('Circuit Breaker ステートマシン')).toBeInTheDocument()
  })

  it('renders CircuitBreakerStateDiagram', () => {
    renderPage()
    expect(screen.getByTestId('circuit-breaker-state-diagram')).toBeInTheDocument()
  })

  it('passes correct state prop to CircuitBreakerStateDiagram', () => {
    mockUsePolling.mockReturnValue({
      data: makeHealthData('CLOSED'),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    renderPage()
    const diagram = screen.getByTestId('circuit-breaker-state-diagram')
    expect(diagram).toHaveAttribute('data-state', 'CLOSED')
  })

  it('passes failure rate and slow call rate to diagram', () => {
    mockUsePolling.mockReturnValue({
      data: makeHealthData('OPEN', 60, 30),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    renderPage()
    const diagram = screen.getByTestId('circuit-breaker-state-diagram')
    expect(diagram).toHaveAttribute('data-failure-rate', '60')
    expect(diagram).toHaveAttribute('data-slow-call-rate', '30')
  })

  it('shows loading state when data is not yet available', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.queryByTestId('circuit-breaker-state-diagram')).not.toBeInTheDocument()
  })

  it('renders error injection toggle button', () => {
    renderPage()
    expect(screen.getByText('▶ エラー注入 ON')).toBeInTheDocument()
  })

  it('renders reset button', () => {
    renderPage()
    expect(screen.getByText('↺ サーキットブレーカー リセット')).toBeInTheDocument()
  })

  it('calls cacheApi.simulateError(true) when toggle button is clicked', async () => {
    renderPage()
    fireEvent.click(screen.getByText('▶ エラー注入 ON'))
    await waitFor(() => {
      expect(mockSimulateError).toHaveBeenCalledWith(true)
    })
  })

  it('toggles button label to OFF after enabling simulation', async () => {
    renderPage()
    fireEvent.click(screen.getByText('▶ エラー注入 ON'))
    await waitFor(() => {
      expect(screen.getByText('⏹ エラー注入 OFF')).toBeInTheDocument()
    })
  })

  it('calls cacheApi.simulateError(false) when toggle is clicked again to disable', async () => {
    mockSimulateError.mockResolvedValueOnce({ simulationEnabled: true, timestamp: Date.now() })
    renderPage()
    // Enable first
    fireEvent.click(screen.getByText('▶ エラー注入 ON'))
    await waitFor(() => screen.getByText('⏹ エラー注入 OFF'))
    // Disable
    mockSimulateError.mockResolvedValueOnce({ simulationEnabled: false, timestamp: Date.now() })
    fireEvent.click(screen.getByText('⏹ エラー注入 OFF'))
    await waitFor(() => {
      expect(mockSimulateError).toHaveBeenCalledWith(false)
    })
  })

  it('calls cacheApi.resetCircuitBreaker when reset button is clicked', async () => {
    renderPage()
    fireEvent.click(screen.getByText('↺ サーキットブレーカー リセット'))
    await waitFor(() => {
      expect(mockResetCircuitBreaker).toHaveBeenCalledTimes(1)
    })
  })

  it('shows success message after reset', async () => {
    renderPage()
    fireEvent.click(screen.getByText('↺ サーキットブレーカー リセット'))
    await waitFor(() => {
      expect(screen.getByText('サーキットブレーカーをリセットしました')).toBeInTheDocument()
    })
  })

  it('shows error message when simulateError throws', async () => {
    mockSimulateError.mockRejectedValue(new Error('network error'))
    renderPage()
    fireEvent.click(screen.getByText('▶ エラー注入 ON'))
    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました')).toBeInTheDocument()
    })
  })

  it('shows error message when reset throws', async () => {
    mockResetCircuitBreaker.mockRejectedValue(new Error('network error'))
    renderPage()
    fireEvent.click(screen.getByText('↺ サーキットブレーカー リセット'))
    await waitFor(() => {
      expect(screen.getByText('リセットに失敗しました')).toBeInTheDocument()
    })
  })

  it('disables buttons while action is loading', async () => {
    // Never-resolving promise keeps the button in loading state
    mockSimulateError.mockReturnValue(new Promise(() => {}))
    renderPage()
    const toggleBtn = screen.getByText('▶ エラー注入 ON')
    fireEvent.click(toggleBtn)
    await waitFor(() => {
      expect(toggleBtn).toBeDisabled()
      expect(screen.getByText('↺ サーキットブレーカー リセット')).toBeDisabled()
    })
  })

  it('calls usePolling with 2000ms interval', () => {
    renderPage()
    expect(mockUsePolling).toHaveBeenCalledWith(
      expect.objectContaining({ interval: 2000 })
    )
  })

  it('displays current state label in the control panel', () => {
    mockUsePolling.mockReturnValue({
      data: makeHealthData('OPEN', 75, 20),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
  })

  it('displays failure rate value', () => {
    mockUsePolling.mockReturnValue({
      data: makeHealthData('OPEN', 42.5, 0),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('42.5%')).toBeInTheDocument()
  })
})
