import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BatchActionBar } from '../../../components/cache/BatchActionBar'

describe('BatchActionBar', () => {
  const onBatchDelete = vi.fn()
  const onBatchWarmup = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when selectedCount is 0', () => {
    const { container } = render(
      <BatchActionBar
        selectedCount={0}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={false}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the bar with selected count when selectedCount > 0', () => {
    render(
      <BatchActionBar
        selectedCount={3}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={false}
      />
    )
    expect(screen.getByText('3件')).toBeInTheDocument()
    expect(screen.getByText('選択中:', { exact: false })).toBeInTheDocument()
  })

  it('renders 一括削除 and 一括ウォームアップ buttons', () => {
    render(
      <BatchActionBar
        selectedCount={2}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={false}
      />
    )
    expect(screen.getByText('一括削除')).toBeInTheDocument()
    expect(screen.getByText('一括ウォームアップ')).toBeInTheDocument()
  })

  it('calls onBatchDelete when 一括削除 is clicked', async () => {
    const user = userEvent.setup()
    render(
      <BatchActionBar
        selectedCount={2}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={false}
      />
    )
    await user.click(screen.getByText('一括削除'))
    expect(onBatchDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onBatchWarmup when 一括ウォームアップ is clicked', async () => {
    const user = userEvent.setup()
    render(
      <BatchActionBar
        selectedCount={1}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={false}
      />
    )
    await user.click(screen.getByText('一括ウォームアップ'))
    expect(onBatchWarmup).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons when isProcessing is true', () => {
    render(
      <BatchActionBar
        selectedCount={2}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={true}
      />
    )
    expect(screen.getByText('一括削除')).toBeDisabled()
    expect(screen.getByText('一括ウォームアップ')).toBeDisabled()
  })

  it('does not call handlers when buttons are disabled (isProcessing)', async () => {
    const user = userEvent.setup()
    render(
      <BatchActionBar
        selectedCount={2}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={true}
      />
    )
    await user.click(screen.getByText('一括削除'))
    await user.click(screen.getByText('一括ウォームアップ'))
    expect(onBatchDelete).not.toHaveBeenCalled()
    expect(onBatchWarmup).not.toHaveBeenCalled()
  })

  it('displays selectedCount of 1 correctly', () => {
    render(
      <BatchActionBar
        selectedCount={1}
        onBatchDelete={onBatchDelete}
        onBatchWarmup={onBatchWarmup}
        isProcessing={false}
      />
    )
    expect(screen.getByText('1件')).toBeInTheDocument()
  })
})
