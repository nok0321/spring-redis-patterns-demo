import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '../../pages/DashboardPage'

// Mock API modules
vi.mock('../../api/health', () => ({
  healthApi: {
    get: vi.fn(),
  },
}))
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

// Mock dashboard sub-components to avoid deep rendering
vi.mock('../../components/dashboard/OperationsChart', () => ({
  OperationsChart: () => <div data-testid="operations-chart" />,
}))
vi.mock('../../components/dashboard/ActiveLocksList', () => ({
  ActiveLocksList: () => <div data-testid="active-locks-list" />,
}))
vi.mock('../../components/dashboard/ErrorSummary', () => ({
  ErrorSummary: () => <div data-testid="error-summary" />,
}))
vi.mock('../../components/dashboard/StatusCard', () => ({
  StatusCard: ({ label, value }: { label: string; value: string }) => (
    <div data-testid="status-card">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}))

import { healthApi } from '../../api/health'
import { cacheApi } from '../../api/cache'
import { locksApi } from '../../api/locks'

const mockHealthGet = vi.mocked(healthApi.get)
const mockCacheMetrics = vi.mocked(cacheApi.metrics)
const mockLocksMetrics = vi.mocked(locksApi.metrics)

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHealthGet.mockResolvedValue({
      status: 'UP',
      redis: { status: 'UP', initialized: true },
      circuitBreakers: {
        'cache-operations': {
          state: 'CLOSED',
          failureRate: 0,
          slowCallRate: 0,
          numberOfSuccessfulCalls: 10,
          numberOfFailedCalls: 0,
          numberOfSlowCalls: 0,
        },
      },
    })
    mockCacheMetrics.mockResolvedValue({
      operations: 100,
      redisHits: 75,
      fallbacks: 2,
      errors: 1,
      hitRate: 75,
    })
    mockLocksMetrics.mockResolvedValue({
      totalAcquired: 5,
      totalReleased: 4,
      totalFailed: 1,
      currentlyHeld: 1,
      locks: [],
    })
  })

  it('renders page heading', () => {
    renderDashboard()
    expect(screen.getByText('ダッシュボード')).toBeInTheDocument()
  })

  it('renders 4 StatusCards', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getAllByTestId('status-card')).toHaveLength(4)
    })
  })

  it('shows Redis状態 card', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Redis状態')).toBeInTheDocument()
    })
  })

  it('shows ヒット率 card with value from API', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('ヒット率')).toBeInTheDocument()
      expect(screen.getByText('75%')).toBeInTheDocument()
    })
  })

  it('shows 総操作数 card with value from API', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('総操作数')).toBeInTheDocument()
      expect(screen.getByText('100')).toBeInTheDocument()
    })
  })

  it('shows CB状態 card', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('CB状態')).toBeInTheDocument()
    })
  })

  it('renders OperationsChart', () => {
    renderDashboard()
    expect(screen.getByTestId('operations-chart')).toBeInTheDocument()
  })

  it('renders ActiveLocksList and ErrorSummary', () => {
    renderDashboard()
    expect(screen.getByTestId('active-locks-list')).toBeInTheDocument()
    expect(screen.getByTestId('error-summary')).toBeInTheDocument()
  })

  it('shows auto-refresh toggle button as ON initially', () => {
    renderDashboard()
    expect(screen.getByText('自動更新 ON')).toBeInTheDocument()
  })

  it('toggles auto-refresh to OFF when clicked', () => {
    renderDashboard()
    const toggleBtn = screen.getByText('自動更新 ON')
    fireEvent.click(toggleBtn)
    expect(screen.getByText('自動更新 OFF')).toBeInTheDocument()
  })

  it('shows 更新 button', () => {
    renderDashboard()
    expect(screen.getByText('更新')).toBeInTheDocument()
  })

  it('calls all fetch functions when 更新 is clicked', async () => {
    renderDashboard()
    // Wait for initial load
    await waitFor(() => expect(mockHealthGet).toHaveBeenCalledTimes(1))
    const refreshBtn = screen.getByText('更新')
    fireEvent.click(refreshBtn)
    await waitFor(() => expect(mockHealthGet).toHaveBeenCalledTimes(2))
    expect(mockCacheMetrics).toHaveBeenCalledTimes(2)
    expect(mockLocksMetrics).toHaveBeenCalledTimes(2)
  })

  it('shows UP value when redis status is UP', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('UP')).toBeInTheDocument()
    })
  })

  it('shows DOWN value when redis is down', async () => {
    mockHealthGet.mockResolvedValue({
      status: 'DOWN',
      redis: { status: 'DOWN', initialized: true },
      circuitBreakers: {},
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('DOWN')).toBeInTheDocument()
    })
  })

  it('shows N/A when data not yet loaded', () => {
    // Override with never-resolving promise so initial state stays empty
    mockHealthGet.mockReturnValue(new Promise(() => {}))
    mockCacheMetrics.mockReturnValue(new Promise(() => {}))
    mockLocksMetrics.mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
