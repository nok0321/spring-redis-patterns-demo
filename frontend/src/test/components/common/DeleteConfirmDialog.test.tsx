import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteConfirmDialog } from '../../../components/common/DeleteConfirmDialog'

describe('DeleteConfirmDialog', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <DeleteConfirmDialog isOpen={false} target="mykey" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog when isOpen is true', () => {
    render(
      <DeleteConfirmDialog isOpen={true} target="mykey" onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(screen.getByText('削除の確認')).toBeInTheDocument()
    expect(screen.getByText('mykey')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <DeleteConfirmDialog isOpen={true} target="mykey" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    await user.click(screen.getByText('削除する'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel button clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <DeleteConfirmDialog isOpen={true} target="mykey" onConfirm={vi.fn()} onCancel={onCancel} />
    )
    await user.click(screen.getByText('キャンセル'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('disables confirm button when isDeleting is true', () => {
    render(
      <DeleteConfirmDialog isOpen={true} target="mykey" onConfirm={vi.fn()} onCancel={vi.fn()} isDeleting={true} />
    )
    expect(screen.getByText('削除中...')).toBeDisabled()
  })
})
