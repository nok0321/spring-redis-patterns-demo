import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransferForm } from '../../../components/locks/TransferForm'

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

describe('TransferForm', () => {
  const onTransferComplete = vi.fn()
  const onError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('フォームが表示される', () => {
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    expect(screen.getByText('送金元キー')).toBeInTheDocument()
    expect(screen.getByText('送金先キー')).toBeInTheDocument()
    expect(screen.getByText('送金額')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '送金実行' })).toBeInTheDocument()
  })

  it('デフォルト値が設定されている', () => {
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    expect(screen.getByDisplayValue('balance:account:A')).toBeInTheDocument()
    expect(screen.getByDisplayValue('balance:account:B')).toBeInTheDocument()
  })

  it('金額が空のときバリデーションエラーを表示する', async () => {
    const user = userEvent.setup()
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    await user.click(screen.getByRole('button', { name: '送金実行' }))
    await waitFor(() => {
      expect(screen.getByText('金額は0より大きい値を入力してください')).toBeInTheDocument()
    })
  })

  it('送金元と送金先が同じときバリデーションエラーを表示する', async () => {
    const user = userEvent.setup()
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    const inputs = screen.getAllByRole('textbox')
    // Set toKey same as fromKey
    await user.clear(inputs[1])
    await user.type(inputs[1], 'balance:account:A')
    await user.type(screen.getByRole('spinbutton'), '1000')
    await user.click(screen.getByRole('button', { name: '送金実行' }))
    await waitFor(() => {
      expect(screen.getByText('送金元キーと送金先キーが同じです')).toBeInTheDocument()
    })
  })

  it('送金元キーが空のときバリデーションエラーを表示する', async () => {
    const user = userEvent.setup()
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    const inputs = screen.getAllByRole('textbox')
    await user.clear(inputs[0])
    await user.type(screen.getByRole('spinbutton'), '1000')
    await user.click(screen.getByRole('button', { name: '送金実行' }))
    await waitFor(() => {
      expect(screen.getByText('送金元キーと送金先キーは必須です')).toBeInTheDocument()
    })
  })

  it('正常に送金を実行する', async () => {
    const user = userEvent.setup()
    const response = {
      transferId: 'abc123',
      success: true,
      fromKey: 'balance:account:A',
      toKey: 'balance:account:B',
      amount: 1000,
      timestamp: Date.now(),
    }
    vi.mocked(locksApi.transfer).mockResolvedValue(response)
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    await user.type(screen.getByRole('spinbutton'), '1000')
    await user.click(screen.getByRole('button', { name: '送金実行' }))
    await waitFor(() => {
      expect(locksApi.transfer).toHaveBeenCalledWith({
        fromKey: 'balance:account:A',
        toKey: 'balance:account:B',
        amount: 1000,
      })
      expect(onTransferComplete).toHaveBeenCalledWith(response)
    })
  })

  it('送金失敗のとき onError を呼ぶ', async () => {
    const user = userEvent.setup()
    const response = {
      transferId: 'abc123',
      success: false,
      fromKey: 'balance:account:A',
      toKey: 'balance:account:B',
      amount: 1000,
      timestamp: Date.now(),
    }
    vi.mocked(locksApi.transfer).mockResolvedValue(response)
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    await user.type(screen.getByRole('spinbutton'), '1000')
    await user.click(screen.getByRole('button', { name: '送金実行' }))
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('送金失敗')
    })
  })

  it('API エラー時に onError を呼ぶ', async () => {
    const user = userEvent.setup()
    vi.mocked(locksApi.transfer).mockRejectedValue(new Error('ネットワークエラー'))
    render(<TransferForm onTransferComplete={onTransferComplete} onError={onError} />)
    await user.type(screen.getByRole('spinbutton'), '1000')
    await user.click(screen.getByRole('button', { name: '送金実行' }))
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('ネットワークエラー')
    })
  })
})
