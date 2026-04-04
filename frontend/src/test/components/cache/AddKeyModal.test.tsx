import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddKeyModal } from '../../../components/cache/AddKeyModal'

describe('AddKeyModal', () => {
  const onClose = vi.fn()
  const onAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <AddKeyModal isOpen={false} onClose={onClose} onAdd={onAdd} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the modal when isOpen is true', () => {
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('新規キー追加')).toBeInTheDocument()
  })

  it('renders key, value, TTL inputs', () => {
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    expect(screen.getByLabelText('キー')).toBeInTheDocument()
    expect(screen.getByLabelText('値')).toBeInTheDocument()
    expect(screen.getByLabelText('TTL（秒）')).toBeInTheDocument()
  })

  it('calls onClose when the X button is clicked', async () => {
    const user = userEvent.setup()
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    // The X icon button — find by its close sibling of the title
    const buttons = screen.getAllByRole('button')
    // X button is the first one (next to title)
    await user.click(buttons[0])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when キャンセル is clicked', async () => {
    const user = userEvent.setup()
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.click(screen.getByText('キャンセル'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows error when submitting with empty key', async () => {
    const user = userEvent.setup()
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.click(screen.getByText('追加'))
    expect(screen.getByText('キーは必須です')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('shows error when submitting with empty value', async () => {
    const user = userEvent.setup()
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'my:key')
    await user.click(screen.getByText('追加'))
    expect(screen.getByText('値は必須です')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('shows error for invalid TTL (negative number)', async () => {
    const user = userEvent.setup()
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'my:key')
    await user.type(screen.getByLabelText('値'), 'somevalue')
    await user.type(screen.getByLabelText('TTL（秒）'), '-5')
    await user.click(screen.getByText('追加'))
    expect(screen.getByText('TTLは0以上の数値を入力してください')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('calls onAdd with parsed JSON value when value is valid JSON', async () => {
    const user = userEvent.setup()
    onAdd.mockResolvedValue(undefined)
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'session:1')
    // Use fireEvent.change to avoid user-event's special handling of curly braces
    fireEvent.change(screen.getByLabelText('値'), { target: { value: '{"id":1}' } })
    await user.click(screen.getByText('追加'))
    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith('session:1', { id: 1 }, undefined)
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onAdd with raw string value when value is not valid JSON', async () => {
    const user = userEvent.setup()
    onAdd.mockResolvedValue(undefined)
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'session:2')
    await user.type(screen.getByLabelText('値'), 'plain-text')
    await user.click(screen.getByText('追加'))
    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith('session:2', 'plain-text', undefined)
    })
  })

  it('calls onAdd with TTL when a valid TTL is provided', async () => {
    const user = userEvent.setup()
    onAdd.mockResolvedValue(undefined)
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'session:3')
    await user.type(screen.getByLabelText('値'), 'hello')
    await user.type(screen.getByLabelText('TTL（秒）'), '300')
    await user.click(screen.getByText('追加'))
    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith('session:3', 'hello', 300)
    })
  })

  it('shows error message when onAdd rejects', async () => {
    const user = userEvent.setup()
    onAdd.mockRejectedValue(new Error('サーバーエラー'))
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'session:4')
    await user.type(screen.getByLabelText('値'), 'value')
    await user.click(screen.getByText('追加'))
    await waitFor(() => {
      expect(screen.getByText('サーバーエラー')).toBeInTheDocument()
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows fallback error when onAdd rejects with non-Error', async () => {
    const user = userEvent.setup()
    onAdd.mockRejectedValue('unknown error')
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'session:5')
    await user.type(screen.getByLabelText('値'), 'value')
    await user.click(screen.getByText('追加'))
    await waitFor(() => {
      expect(screen.getByText('追加に失敗しました')).toBeInTheDocument()
    })
  })

  it('disables the submit button while submitting', async () => {
    const user = userEvent.setup()
    // Never resolves — stays in submitting state
    onAdd.mockReturnValue(new Promise(() => {}))
    render(<AddKeyModal isOpen={true} onClose={onClose} onAdd={onAdd} />)
    await user.type(screen.getByLabelText('キー'), 'session:6')
    await user.type(screen.getByLabelText('値'), 'value')
    await user.click(screen.getByText('追加'))
    await waitFor(() => {
      expect(screen.getByText('追加中...')).toBeInTheDocument()
      expect(screen.getByText('追加中...')).toBeDisabled()
    })
  })
})
