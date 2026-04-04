import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LockDemoPage } from '../../pages/LockDemoPage'
import type { LockDemoResponse } from '../../types/locks'

// Mock locksApi
vi.mock('../../api/locks', () => ({
  locksApi: {
    runDemo: vi.fn(),
  },
}))

// Mock LockTimelineChart to avoid recharts rendering complexity
vi.mock('../../components/locks/LockTimelineChart', () => ({
  LockTimelineChart: ({ title }: { title: string }) => (
    <div data-testid="lock-timeline-chart">{title}</div>
  ),
}))

import { locksApi } from '../../api/locks'

const mockRunDemo = vi.mocked(locksApi.runDemo)

const makeModeResult = (correct: boolean) => ({
  initialValue: 10,
  expectedFinal: 6,
  actualFinal: correct ? 6 : 8,
  lostUpdates: correct ? 0 : 2,
  correct,
  events: [
    { workerId: 1, step: 'READ' as const, value: 10, relativeMs: 0 },
    { workerId: 1, step: 'WRITE' as const, value: 9, relativeMs: 5 },
  ],
})

const mockDemoResponse: LockDemoResponse = {
  withoutLock: makeModeResult(false),
  withLock: makeModeResult(true),
  timestamp: Date.now(),
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/locks/demo']}>
      <Routes>
        <Route path="/locks/demo" element={<LockDemoPage />} />
        <Route path="/locks" element={<div>lock-monitor-page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LockDemoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunDemo.mockResolvedValue(mockDemoResponse)
  })

  it('renders page heading', () => {
    renderPage()
    expect(screen.getByText('分散ロック デモ')).toBeInTheDocument()
  })

  it('renders back button and navigates to /locks', () => {
    renderPage()
    // The back button contains "ロックモニター" text
    fireEvent.click(screen.getByText('ロックモニター'))
    expect(screen.getByText('lock-monitor-page')).toBeInTheDocument()
  })

  it('shows worker count slider with default value 4', () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    // First slider is workers
    expect(sliders[0]).toHaveValue('4')
  })

  it('shows initial value slider with default value 10', () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    // Second slider is initialValue
    expect(sliders[1]).toHaveValue('10')
  })

  it('shows worker count label with default value', () => {
    renderPage()
    // "ワーカー数: 4" label contains the bold value
    expect(screen.getByText(/ワーカー数/)).toBeInTheDocument()
  })

  it('updates worker count when slider is changed', () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '6' } })
    expect(sliders[0]).toHaveValue('6')
  })

  it('updates initial value when slider is changed', () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[1], { target: { value: '20' } })
    expect(sliders[1]).toHaveValue('20')
  })

  it('renders "デモを実行" button', () => {
    renderPage()
    expect(screen.getByText('デモを実行')).toBeInTheDocument()
  })

  it('calls locksApi.runDemo with default params when button is clicked', async () => {
    renderPage()
    fireEvent.click(screen.getByText('デモを実行'))
    await waitFor(() => {
      expect(mockRunDemo).toHaveBeenCalledWith({ workers: 4, initialValue: 10 })
    })
  })

  it('calls locksApi.runDemo with updated params', async () => {
    renderPage()
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '6' } })
    fireEvent.change(sliders[1], { target: { value: '20' } })
    fireEvent.click(screen.getByText('デモを実行'))
    await waitFor(() => {
      expect(mockRunDemo).toHaveBeenCalledWith({ workers: 6, initialValue: 20 })
    })
  })

  it('shows button as "実行中..." while running', async () => {
    // Never-resolving promise so the button stays in loading state
    mockRunDemo.mockReturnValue(new Promise(() => {}))
    renderPage()
    fireEvent.click(screen.getByText('デモを実行'))
    await waitFor(() => {
      expect(screen.getByText('実行中...')).toBeInTheDocument()
    })
  })

  it('shows result panels after successful API call', async () => {
    renderPage()
    fireEvent.click(screen.getByText('デモを実行'))
    await waitFor(() => {
      expect(screen.getByText('ロックなし（競合あり）')).toBeInTheDocument()
      expect(screen.getByText('ロックあり（分散ロック）')).toBeInTheDocument()
    })
  })

  it('shows timeline chart components after successful API call', async () => {
    renderPage()
    fireEvent.click(screen.getByText('デモを実行'))
    await waitFor(() => {
      const charts = screen.getAllByTestId('lock-timeline-chart')
      expect(charts).toHaveLength(2)
    })
  })

  it('displays error banner when API call fails', async () => {
    mockRunDemo.mockRejectedValue(new Error('サーバーエラー'))
    renderPage()
    fireEvent.click(screen.getByText('デモを実行'))
    await waitFor(() => {
      expect(screen.getByText('サーバーエラー')).toBeInTheDocument()
    })
  })

  it('does not show result panels on error', async () => {
    mockRunDemo.mockRejectedValue(new Error('サーバーエラー'))
    renderPage()
    fireEvent.click(screen.getByText('デモを実行'))
    await waitFor(() => {
      expect(screen.queryByText('ロックなし（競合あり）')).not.toBeInTheDocument()
      expect(screen.queryByText('ロックあり（分散ロック）')).not.toBeInTheDocument()
    })
  })

  it('does not show result panels before button is clicked', () => {
    renderPage()
    expect(screen.queryByText('ロックなし（競合あり）')).not.toBeInTheDocument()
    expect(screen.queryByText('ロックあり（分散ロック）')).not.toBeInTheDocument()
  })
})
