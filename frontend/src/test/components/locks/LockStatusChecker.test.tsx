import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LockStatusChecker } from '../../../components/locks/LockStatusChecker'

vi.mock('../../../api/locks', () => ({
  locksApi: {
    status: vi.fn(),
    checkStatus: vi.fn(),
    acquireFenced: vi.fn(),
    execute: vi.fn(),
    metrics: vi.fn(),
    transfer: vi.fn(),
    runDemo: vi.fn(),
  },
}))

import { locksApi } from '../../../api/locks'

describe('LockStatusChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('フォームが表示される', () => {
    render(<LockStatusChecker />)
    expect(screen.getByText('ロック状態確認')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('lock:order:123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '確認' })).toBeInTheDocument()
  })

  it('キーが空のとき確認ボタンが無効', () => {
    render(<LockStatusChecker />)
    expect(screen.getByRole('button', { name: '確認' })).toBeDisabled()
  })

  it('キー入力後にボタンが有効になる', async () => {
    const user = userEvent.setup()
    render(<LockStatusChecker />)
    await user.type(screen.getByPlaceholderText('lock:order:123'), 'lock:order:1')
    expect(screen.getByRole('button', { name: '確認' })).toBeEnabled()
  })

  it('ロック状態を確認して結果を表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(locksApi.status).mockResolvedValue({
      lockKey: 'lock:order:1',
      locked: true,
      timestamp: Date.now(),
    })
    render(<LockStatusChecker />)
    await user.type(screen.getByPlaceholderText('lock:order:123'), 'lock:order:1')
    await user.click(screen.getByRole('button', { name: '確認' }))
    await waitFor(() => {
      expect(screen.getByText('locked:')).toBeInTheDocument()
      expect(screen.getByText('true')).toBeInTheDocument()
    })
  })

  it('locked=false のとき canAcquire は true', async () => {
    const user = userEvent.setup()
    vi.mocked(locksApi.status).mockResolvedValue({
      lockKey: 'lock:order:1',
      locked: false,
      timestamp: Date.now(),
    })
    render(<LockStatusChecker />)
    await user.type(screen.getByPlaceholderText('lock:order:123'), 'lock:order:1')
    await user.click(screen.getByRole('button', { name: '確認' }))
    await waitFor(() => {
      expect(screen.getByText('canAcquire:')).toBeInTheDocument()
      expect(screen.getByText('true')).toBeInTheDocument()
    })
  })

  it('エラー時にエラーメッセージを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(locksApi.status).mockRejectedValue(new Error('確認失敗'))
    render(<LockStatusChecker />)
    await user.type(screen.getByPlaceholderText('lock:order:123'), 'lock:order:1')
    await user.click(screen.getByRole('button', { name: '確認' }))
    await waitFor(() => {
      expect(screen.getByText('確認失敗')).toBeInTheDocument()
    })
  })

  it('Enter キーで確認を実行する', async () => {
    const user = userEvent.setup()
    vi.mocked(locksApi.status).mockResolvedValue({
      lockKey: 'lock:order:1',
      locked: false,
      timestamp: Date.now(),
    })
    render(<LockStatusChecker />)
    const input = screen.getByPlaceholderText('lock:order:123')
    await user.type(input, 'lock:order:1')
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(locksApi.status).toHaveBeenCalledWith('lock:order:1')
    })
  })
})
