import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SagaTracerPage } from '../../pages/SagaTracerPage'

// Mock API
vi.mock('../../api/transaction', () => ({
  transactionApi: {
    runSaga: vi.fn(),
    runSagaFail: vi.fn(),
  },
}))

// Mock sub-component
vi.mock('../../components/locks/SagaFlowDiagram', () => ({
  SagaFlowDiagram: ({ steps, compensationSteps }: {
    steps: unknown[]
    compensationSteps?: unknown[]
  }) => (
    <div
      data-testid="saga-flow-diagram"
      data-steps={steps.length}
      data-compensation={compensationSteps?.length ?? 0}
    />
  ),
}))

import { transactionApi } from '../../api/transaction'

const mockRunSaga = vi.mocked(transactionApi.runSaga)
const mockRunSagaFail = vi.mocked(transactionApi.runSagaFail)

const mockSuccessResult = {
  steps: [
    { name: 'OrderCreated', status: 'SUCCESS' as const, durationMs: 12, detail: '' },
    { name: 'PaymentProcessed', status: 'SUCCESS' as const, durationMs: 34, detail: '' },
    { name: 'InventoryReserved', status: 'SUCCESS' as const, durationMs: 8, detail: '' },
  ],
  overallStatus: 'SUCCESS' as const,
  timestamp: Date.parse('2026-04-04T00:00:00Z'),
}

const mockFailResult = {
  steps: [
    { name: 'OrderCreated', status: 'SUCCESS' as const, durationMs: 12, detail: '' },
    { name: 'PaymentProcessed', status: 'FAILED' as const, durationMs: 5, detail: 'error' },
  ],
  compensationSteps: [
    { name: 'OrderCancelled', status: 'COMPENSATED' as const, durationMs: 9, detail: '' },
  ],
  overallStatus: 'COMPENSATED' as const,
  timestamp: Date.parse('2026-04-04T00:00:00Z'),
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SagaTracerPage />
    </MemoryRouter>
  )
}

describe('SagaTracerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunSaga.mockResolvedValue(mockSuccessResult)
    mockRunSagaFail.mockResolvedValue(mockFailResult)
  })

  it('renders page heading', () => {
    renderPage()
    expect(screen.getByText('Saga パターン実行トレーサー')).toBeInTheDocument()
  })

  it('renders 通常実行 button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /通常実行/ })).toBeInTheDocument()
  })

  it('renders 失敗 → 補償実行 button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /失敗.*補償実行/ })).toBeInTheDocument()
  })

  it('does not show result section initially', () => {
    renderPage()
    expect(screen.queryByTestId('saga-flow-diagram')).not.toBeInTheDocument()
    expect(screen.queryByText('SUCCESS')).not.toBeInTheDocument()
  })

  it('calls transactionApi.runSaga when 通常実行 is clicked', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(mockRunSaga).toHaveBeenCalledTimes(1)
    })
    expect(mockRunSagaFail).not.toHaveBeenCalled()
  })

  it('calls transactionApi.runSagaFail when 失敗 → 補償実行 is clicked', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /失敗.*補償実行/ }))
    await waitFor(() => {
      expect(mockRunSagaFail).toHaveBeenCalledTimes(1)
    })
    expect(mockRunSaga).not.toHaveBeenCalled()
  })

  it('shows 実行中... while request is in progress', async () => {
    mockRunSaga.mockReturnValue(new Promise(() => {}))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByText('実行中...')).toBeInTheDocument()
    })
  })

  it('disables buttons while loading', async () => {
    mockRunSaga.mockReturnValue(new Promise(() => {}))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /通常実行/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /失敗.*補償実行/ })).toBeDisabled()
    })
  })

  it('shows SUCCESS overallStatus badge after normal run', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByText('SUCCESS')).toBeInTheDocument()
    })
  })

  it('shows COMPENSATED overallStatus badge after fail run', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /失敗.*補償実行/ }))
    await waitFor(() => {
      expect(screen.getByText('COMPENSATED')).toBeInTheDocument()
    })
  })

  it('renders SagaFlowDiagram after successful run', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByTestId('saga-flow-diagram')).toBeInTheDocument()
    })
  })

  it('passes correct step count to SagaFlowDiagram', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      const diagram = screen.getByTestId('saga-flow-diagram')
      expect(diagram).toHaveAttribute('data-steps', '3')
    })
  })

  it('passes compensation steps to SagaFlowDiagram after fail run', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /失敗.*補償実行/ }))
    await waitFor(() => {
      const diagram = screen.getByTestId('saga-flow-diagram')
      expect(diagram).toHaveAttribute('data-compensation', '1')
    })
  })

  it('displays error message when runSaga fails', async () => {
    mockRunSaga.mockRejectedValue(new Error('サーバーエラーが発生しました'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByText('サーバーエラーが発生しました')).toBeInTheDocument()
    })
  })

  it('displays error message when runSagaFail throws', async () => {
    mockRunSagaFail.mockRejectedValue(new Error('接続タイムアウト'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /失敗.*補償実行/ }))
    await waitFor(() => {
      expect(screen.getByText('接続タイムアウト')).toBeInTheDocument()
    })
  })

  it('clears previous result when a new run starts', async () => {
    renderPage()
    // First run completes with SUCCESS
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByText('SUCCESS')).toBeInTheDocument()
    })
    // Second run — keep it pending so result is cleared
    mockRunSagaFail.mockReturnValue(new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name: /失敗.*補償実行/ }))
    await waitFor(() => {
      expect(screen.queryByText('SUCCESS')).not.toBeInTheDocument()
    })
  })

  it('shows explanation section about Saga pattern after result', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByText('Saga パターンとは')).toBeInTheDocument()
    })
  })

  it('shows legend section after result', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /通常実行/ }))
    await waitFor(() => {
      expect(screen.getByText('凡例')).toBeInTheDocument()
    })
  })
})
