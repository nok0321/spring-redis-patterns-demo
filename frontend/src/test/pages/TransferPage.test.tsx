import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TransferPage } from '../../pages/TransferPage'
import type { TransferResponse } from '../../types/locks'

// Mock child components
vi.mock('../../components/locks/TransferForm', () => ({
  TransferForm: ({
    onTransferComplete,
    onError,
  }: {
    onTransferComplete: (r: TransferResponse) => void
    onError: (msg: string) => void
  }) => (
    <div data-testid="transfer-form">
      <button
        onClick={() =>
          onTransferComplete({
            transferId: 'txn-1',
            success: true,
            fromKey: 'account:alice',
            toKey: 'account:bob',
            amount: 5000,
            timestamp: Date.now(),
          })
        }
      >
        trigger-complete
      </button>
      <button onClick={() => onError('送金に失敗しました')}>trigger-error</button>
    </div>
  ),
}))

vi.mock('../../components/locks/TransferLog', () => ({
  TransferLog: ({ logs }: { logs: TransferResponse[] }) => (
    <div data-testid="transfer-log">
      <span data-testid="log-count">{logs.length}</span>
    </div>
  ),
}))

vi.mock('../../components/common/ToastContainer', () => ({
  ToastContainer: ({
    toasts,
  }: {
    toasts: { id: string; message: string; variant: string }[]
  }) => (
    <div data-testid="toast-container">
      {toasts.map(t => (
        <div key={t.id} data-testid={`toast-${t.variant}`}>
          {t.message}
        </div>
      ))}
    </div>
  ),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/locks/transfer']}>
      <Routes>
        <Route path="/locks/transfer" element={<TransferPage />} />
        <Route path="/locks" element={<div>lock-monitor-page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('TransferPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page heading', () => {
    renderPage()
    expect(
      screen.getByText('送金デモ（分散ロック + トランザクション）')
    ).toBeInTheDocument()
  })

  it('renders back button labeled "ロックモニター"', () => {
    renderPage()
    expect(screen.getByText('ロックモニター')).toBeInTheDocument()
  })

  it('navigates to /locks when back button is clicked', () => {
    renderPage()
    fireEvent.click(screen.getByText('ロックモニター'))
    expect(screen.getByText('lock-monitor-page')).toBeInTheDocument()
  })

  it('renders TransferForm component', () => {
    renderPage()
    expect(screen.getByTestId('transfer-form')).toBeInTheDocument()
  })

  it('renders TransferLog component', () => {
    renderPage()
    expect(screen.getByTestId('transfer-log')).toBeInTheDocument()
  })

  it('renders ToastContainer component', () => {
    renderPage()
    expect(screen.getByTestId('toast-container')).toBeInTheDocument()
  })

  it('adds log entry when transfer completes successfully', async () => {
    renderPage()
    expect(screen.getByTestId('log-count')).toHaveTextContent('0')
    fireEvent.click(screen.getByText('trigger-complete'))
    await waitFor(() => {
      expect(screen.getByTestId('log-count')).toHaveTextContent('1')
    })
  })

  it('shows success toast when transfer completes', async () => {
    renderPage()
    fireEvent.click(screen.getByText('trigger-complete'))
    await waitFor(() => {
      expect(screen.getByTestId('toast-success')).toBeInTheDocument()
      expect(screen.getByTestId('toast-success').textContent).toMatch(/5,000/)
    })
  })

  it('shows error toast when error callback is triggered', async () => {
    renderPage()
    fireEvent.click(screen.getByText('trigger-error'))
    await waitFor(() => {
      expect(screen.getByTestId('toast-error')).toBeInTheDocument()
      expect(screen.getByTestId('toast-error')).toHaveTextContent('送金に失敗しました')
    })
  })

  it('does not add log entry on error', async () => {
    renderPage()
    fireEvent.click(screen.getByText('trigger-error'))
    await waitFor(() => {
      expect(screen.getByTestId('log-count')).toHaveTextContent('0')
    })
  })
})
