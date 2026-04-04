import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RateLimiterPage } from '../../pages/RateLimiterPage'

// Mock hooks
vi.mock('../../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}))

// Mock API
vi.mock('../../api/rateLimiter', () => ({
  rateLimiterApi: {
    getStatus: vi.fn(),
    flood: vi.fn(),
  },
}))

// Mock sub-component
vi.mock('../../components/metrics/TokenBucketAnimation', () => ({
  TokenBucketAnimation: ({ availablePermissions, maxPermissions, waitingThreads }: {
    availablePermissions: number
    maxPermissions: number
    waitingThreads: number
  }) => (
    <div
      data-testid="token-bucket-animation"
      data-available={availablePermissions}
      data-max={maxPermissions}
      data-waiting={waitingThreads}
    />
  ),
}))

import { usePolling } from '../../hooks/usePolling'
import { rateLimiterApi } from '../../api/rateLimiter'

const mockUsePolling = vi.mocked(usePolling)
const mockFlood = vi.mocked(rateLimiterApi.flood)

const mockStatus = {
  limitForPeriod: 10,
  availablePermissions: 8,
  numberOfWaitingThreads: 0,
  cyclePeriodMs: 1000,
}

const mockFloodResult = {
  requested: 15,
  permitted: 10,
  rejected: 5,
  events: [
    { workerId: 1, permitted: true, relativeMs: 0 },
    { workerId: 2, permitted: false, relativeMs: 5 },
  ],
  timestamp: '2026-04-04T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RateLimiterPage />
    </MemoryRouter>
  )
}

describe('RateLimiterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePolling.mockReturnValue({
      data: mockStatus,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    mockFlood.mockResolvedValue(mockFloodResult)
  })

  it('renders page heading', () => {
    renderPage()
    expect(screen.getByText('Rate Limiter バケツアニメーション')).toBeInTheDocument()
  })

  it('renders TokenBucketAnimation component', () => {
    renderPage()
    expect(screen.getByTestId('token-bucket-animation')).toBeInTheDocument()
  })

  it('shows default total of 15 (workers=5 * burstCount=3)', () => {
    renderPage()
    // The page renders "合計リクエスト数: {workers * burstCount}" = 5 * 3 = 15
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('renders flood button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /フラッド実行/ })).toBeInTheDocument()
  })

  it('flood button calls rateLimiterApi.flood with default workers and burstCount', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /フラッド実行/ }))
    await waitFor(() => {
      expect(mockFlood).toHaveBeenCalledWith(5, 3)
    })
  })

  it('displays flood results after successful call', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /フラッド実行/ }))
    await waitFor(() => {
      expect(screen.getByText('実行結果')).toBeInTheDocument()
    })
    // Section labels appear in the result grid
    expect(screen.getByText('総リクエスト')).toBeInTheDocument()
    expect(screen.getByText('許可')).toBeInTheDocument()
    expect(screen.getByText('拒否')).toBeInTheDocument()
  })

  it('displays error message when flood fails', async () => {
    mockFlood.mockRejectedValue(new Error('レート制限エラー'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /フラッド実行/ }))
    await waitFor(() => {
      expect(screen.getByText('レート制限エラー')).toBeInTheDocument()
    })
  })

  it('shows 実行中... while flood is in progress', async () => {
    // Return a promise that never resolves to keep loading state
    mockFlood.mockReturnValue(new Promise(() => {}))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /フラッド実行/ }))
    await waitFor(() => {
      expect(screen.getByText('実行中...')).toBeInTheDocument()
    })
  })

  it('updates total when workers slider changes', async () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    // First slider is workers (default 5), second is burstCount (default 3)
    fireEvent.change(sliders[0], { target: { value: '10' } })
    await waitFor(() => {
      // 10 * 3 = 30
      expect(screen.getByText('30')).toBeInTheDocument()
    })
  })

  it('updates total when burstCount slider changes', async () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[1], { target: { value: '5' } })
    await waitFor(() => {
      // 5 * 5 = 25
      expect(screen.getByText('25')).toBeInTheDocument()
    })
  })

  it('calls flood with updated slider values', async () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '8' } })
    fireEvent.change(sliders[1], { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /フラッド実行/ }))
    await waitFor(() => {
      expect(mockFlood).toHaveBeenCalledWith(8, 4)
    })
  })

  it('shows status values from polling when available', () => {
    renderPage()
    // cyclePeriodMs from mockStatus = 1000
    expect(screen.getByText('1000ms')).toBeInTheDocument()
    // maxPermissions = limitForPeriod = 10
    const maxPermissionsEls = screen.getAllByText('10')
    expect(maxPermissionsEls.length).toBeGreaterThanOrEqual(1)
  })

  it('shows fallback values when status is not yet loaded', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      isLoading: true,
      refetch: vi.fn(),
    })
    renderPage()
    // When status is null, maxPermissions defaults to 10 and cyclePeriodMs shows '-'
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('renders event log entries after flood result', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /フラッド実行/ }))
    await waitFor(() => {
      expect(screen.getByText('実行結果')).toBeInTheDocument()
    })
    // Event log shows worker IDs
    expect(screen.getByText('W1')).toBeInTheDocument()
    expect(screen.getByText('W2')).toBeInTheDocument()
  })
})
