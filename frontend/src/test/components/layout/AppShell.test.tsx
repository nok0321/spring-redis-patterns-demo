import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '../../../components/layout/AppShell'

// Mock getBaseUrl / setBaseUrl
vi.mock('../../../api/client', () => ({
  getBaseUrl: vi.fn(() => ''),
  setBaseUrl: vi.fn(),
}))

// Mock healthApi so polling doesn't hit real network
vi.mock('../../../api/health', () => ({
  healthApi: {
    get: vi.fn(() => Promise.resolve({ status: 'UP', redis: { status: 'UP' } })),
  },
}))

function renderShell(children = <div>content</div>) {
  return render(
    <MemoryRouter>
      <AppShell>{children}</AppShell>
    </MemoryRouter>
  )
}

describe('AppShell', () => {
  it('renders the app title', () => {
    renderShell()
    expect(screen.getByText('Redis Dashboard')).toBeInTheDocument()
  })

  it('renders all navigation links', () => {
    renderShell()
    expect(screen.getByText('ダッシュボード')).toBeInTheDocument()
    expect(screen.getByText('ビジュアライザー')).toBeInTheDocument()
    expect(screen.getByText('キャッシュ')).toBeInTheDocument()
    expect(screen.getByText('ロック')).toBeInTheDocument()
    expect(screen.getByText('メトリクス')).toBeInTheDocument()
    expect(screen.getByText('Circuit Breaker')).toBeInTheDocument()
    expect(screen.getByText('Rate Limiter')).toBeInTheDocument()
    expect(screen.getByText('Pub/Sub')).toBeInTheDocument()
    expect(screen.getByText('Saga')).toBeInTheDocument()
    expect(screen.getByText('Redis CLI')).toBeInTheDocument()
  })

  it('renders children in main area', () => {
    renderShell(<div>my-page-content</div>)
    expect(screen.getByText('my-page-content')).toBeInTheDocument()
  })

  it('opens the connection settings modal when settings button is clicked', async () => {
    renderShell()
    // Modal should not be visible initially
    expect(screen.queryByText('接続設定')).not.toBeInTheDocument()
    // Find and click the settings button (has title 属性)
    const settingsBtn = screen.getByTitle('接続設定')
    fireEvent.click(settingsBtn)
    await waitFor(() => {
      expect(screen.getByText('接続設定')).toBeInTheDocument()
    })
  })

  it('closes the modal when cancel is clicked', async () => {
    renderShell()
    const settingsBtn = screen.getByTitle('接続設定')
    fireEvent.click(settingsBtn)
    await waitFor(() => expect(screen.getByText('接続設定')).toBeInTheDocument())
    fireEvent.click(screen.getByText('キャンセル'))
    await waitFor(() => {
      expect(screen.queryByText('接続設定')).not.toBeInTheDocument()
    })
  })

  it('calls setBaseUrl and closes modal when 保存 is clicked', async () => {
    const { setBaseUrl } = await import('../../../api/client')
    renderShell()
    fireEvent.click(screen.getByTitle('接続設定'))
    await waitFor(() => expect(screen.getByText('接続設定')).toBeInTheDocument())
    const input = screen.getByPlaceholderText('http://localhost:8080')
    fireEvent.change(input, { target: { value: 'http://localhost:9090' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => {
      expect(setBaseUrl).toHaveBeenCalledWith('http://localhost:9090')
    })
    expect(screen.queryByText('接続設定')).not.toBeInTheDocument()
  })

  it('shows connection status badge', async () => {
    renderShell()
    // Either loading indicator or connection status should appear
    // Wait for polling to settle
    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(
        text.includes('接続中') || text.includes('切断') || text.includes('確認中')
      ).toBe(true)
    })
  })
})
