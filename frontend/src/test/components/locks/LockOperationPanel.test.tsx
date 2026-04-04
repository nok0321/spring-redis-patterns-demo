import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LockOperationPanel } from '../../../components/locks/LockOperationPanel'

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

vi.mock('../../../components/common/ResultViewer', () => ({
  ResultViewer: ({ data, error }: { data: unknown; error: string | null }) => (
    <div data-testid="result-viewer">
      {error && <span data-testid="result-error">{error}</span>}
      {data !== null && data !== undefined && <span data-testid="result-data">{JSON.stringify(data)}</span>}
    </div>
  ),
}))

import { locksApi } from '../../../api/locks'

describe('LockOperationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('フォームが表示される', () => {
    render(<LockOperationPanel />)
    expect(screen.getByText('ロック操作テスト')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('lock:order:123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '実行' })).toBeInTheDocument()
  })

  it('キーが空のとき実行ボタンが無効', () => {
    render(<LockOperationPanel />)
    expect(screen.getByRole('button', { name: '実行' })).toBeDisabled()
  })

  it('操作セレクトが表示される', () => {
    render(<LockOperationPanel />)
    expect(screen.getByDisplayValue('cache_read')).toBeInTheDocument()
  })

  it('ロック種別セレクトが表示される（非fenced操作時）', () => {
    render(<LockOperationPanel />)
    expect(screen.getByDisplayValue('standard')).toBeInTheDocument()
  })

  it('fenced 操作を選択するとロック種別セレクトが非表示になる', async () => {
    const user = userEvent.setup()
    render(<LockOperationPanel />)
    // First combobox is the operation selector (cache_read is the default value)
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'fenced_cache_read')
    expect(screen.queryByDisplayValue('standard')).not.toBeInTheDocument()
  })

  it('通常操作を実行する', async () => {
    const user = userEvent.setup()
    vi.mocked(locksApi.execute).mockResolvedValue({ success: true })
    render(<LockOperationPanel />)
    await user.type(screen.getByPlaceholderText('lock:order:123'), 'lock:test:1')
    await user.click(screen.getByRole('button', { name: '実行' }))
    await waitFor(() => {
      expect(locksApi.execute).toHaveBeenCalledWith({
        lockKey: 'lock:test:1',
        operation: 'cache_read',
        data: {},
      })
    })
  })

  it('不正JSONのときエラーを表示する', async () => {
    const user = userEvent.setup()
    render(<LockOperationPanel />)
    await user.type(screen.getByPlaceholderText('lock:order:123'), 'lock:test:1')
    // The textarea has a dynamic placeholder — select by its role among textboxes
    // The lock key input is first, textarea is the second textbox
    const textboxes = screen.getAllByRole('textbox')
    const textarea = textboxes[textboxes.length - 1]
    await user.type(textarea, 'not-valid-json')
    await user.click(screen.getByRole('button', { name: '実行' }))
    await waitFor(() => {
      expect(screen.getByTestId('result-error')).toHaveTextContent('データのJSON形式が不正です')
    })
  })

  it('API エラー時にエラーを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(locksApi.execute).mockRejectedValue(new Error('実行失敗'))
    render(<LockOperationPanel />)
    await user.type(screen.getByPlaceholderText('lock:order:123'), 'lock:test:1')
    await user.click(screen.getByRole('button', { name: '実行' }))
    await waitFor(() => {
      expect(screen.getByTestId('result-error')).toHaveTextContent('実行失敗')
    })
  })
})
