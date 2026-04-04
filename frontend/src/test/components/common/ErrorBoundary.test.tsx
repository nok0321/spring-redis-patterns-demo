import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '../../../components/common/ErrorBoundary'

// Helper component that throws an error on demand
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('テスト用エラー')
  }
  return <div>正常コンテンツ</div>
}

describe('ErrorBoundary', () => {
  // Suppress console.error output during error boundary tests
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('エラーがない場合は子コンポーネントをそのまま表示する', () => {
    render(
      <ErrorBoundary>
        <div>正常コンテンツ</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('正常コンテンツ')).toBeInTheDocument()
  })

  it('エラー発生時にデフォルトのエラーUIを表示する', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('予期しないエラーが発生しました')).toBeInTheDocument()
  })

  it('エラー発生時にエラーメッセージを表示する', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('テスト用エラー')).toBeInTheDocument()
  })

  it('エラー発生時に再試行ボタンを表示する', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })

  it('fallbackプロップが指定された場合はfallbackを表示する', () => {
    render(
      <ErrorBoundary fallback={<div>カスタムエラー表示</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('カスタムエラー表示')).toBeInTheDocument()
    expect(screen.queryByText('予期しないエラーが発生しました')).not.toBeInTheDocument()
  })

  it('再試行ボタンをクリックするとエラー状態がリセットされる', async () => {
    const user = userEvent.setup()

    // Render with non-throwing child initially wrapped in ErrorBoundary
    // Manually trigger error state by rendering a throwing child
    let shouldThrow = true
    const ThrowOrRender = () => {
      if (shouldThrow) throw new Error('テスト用エラー2')
      return <div>回復後コンテンツ</div>
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowOrRender />
      </ErrorBoundary>
    )

    expect(screen.getByText('予期しないエラーが発生しました')).toBeInTheDocument()

    // Stop throwing before clicking retry so re-render succeeds
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: '再試行' }))

    rerender(
      <ErrorBoundary>
        <ThrowOrRender />
      </ErrorBoundary>
    )

    expect(screen.getByText('回復後コンテンツ')).toBeInTheDocument()
  })

  it('子コンポーネントが存在しない場合も正常に動作する', () => {
    render(
      <ErrorBoundary>
        <span>single child</span>
      </ErrorBoundary>
    )
    expect(screen.getByText('single child')).toBeInTheDocument()
  })
})
