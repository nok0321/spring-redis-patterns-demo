import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LockMonitorPage } from '../../pages/LockMonitorPage'

// Mock child components to avoid deep rendering
vi.mock('../../components/locks/LockStatusChecker', () => ({
  LockStatusChecker: () => <div data-testid="lock-status-checker" />,
}))

vi.mock('../../components/locks/LockOperationPanel', () => ({
  LockOperationPanel: () => <div data-testid="lock-operation-panel" />,
}))

vi.mock('../../components/locks/LockMetricsTable', () => ({
  LockMetricsTable: () => <div data-testid="lock-metrics-table" />,
}))

function renderPage(initialPath = '/locks') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/locks" element={<LockMonitorPage />} />
        <Route path="/locks/demo" element={<div>lock-demo-page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LockMonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page heading', () => {
    renderPage()
    expect(screen.getByText('ロックモニター')).toBeInTheDocument()
  })

  it('renders LockStatusChecker component', () => {
    renderPage()
    expect(screen.getByTestId('lock-status-checker')).toBeInTheDocument()
  })

  it('renders LockOperationPanel component', () => {
    renderPage()
    expect(screen.getByTestId('lock-operation-panel')).toBeInTheDocument()
  })

  it('renders LockMetricsTable component', () => {
    renderPage()
    expect(screen.getByTestId('lock-metrics-table')).toBeInTheDocument()
  })

  it('renders navigation button "分散ロックデモ"', () => {
    renderPage()
    expect(screen.getByText('分散ロックデモ')).toBeInTheDocument()
  })

  it('navigates to /locks/demo when button is clicked', () => {
    renderPage()
    fireEvent.click(screen.getByText('分散ロックデモ'))
    expect(screen.getByText('lock-demo-page')).toBeInTheDocument()
  })
})
