import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LockMetricsTable } from '../../../components/locks/LockMetricsTable'

vi.mock('../../../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}))

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

import { usePolling } from '../../../hooks/usePolling'

describe('LockMetricsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ローディング中は読み込み中を表示する', () => {
    vi.mocked(usePolling).mockReturnValue({
      data: null,
      error: null,
      isLoading: true,
      refetch: vi.fn(),
    })
    render(<LockMetricsTable />)
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
  })

  it('エラー時はエラーメッセージを表示する', () => {
    vi.mocked(usePolling).mockReturnValue({
      data: null,
      error: 'メトリクス取得エラー',
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<LockMetricsTable />)
    expect(screen.getByText('メトリクス取得エラー')).toBeInTheDocument()
  })

  it('データが空のとき空メッセージを表示する', () => {
    vi.mocked(usePolling).mockReturnValue({
      data: { locks: {}, timestamp: Date.now() },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<LockMetricsTable />)
    expect(screen.getByText('ロックメトリクスなし')).toBeInTheDocument()
  })

  it('null データのとき空メッセージを表示する', () => {
    vi.mocked(usePolling).mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<LockMetricsTable />)
    expect(screen.getByText('ロックメトリクスなし')).toBeInTheDocument()
  })

  it('ロックメトリクスを表示する', () => {
    vi.mocked(usePolling).mockReturnValue({
      data: {
        locks: {
          'lock:order:1': { attempts: 10, acquisitions: 9, timeouts: 1, releases: 9, operationSuccesses: 9, operationFailures: 0 },
        },
        timestamp: Date.now(),
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<LockMetricsTable />)
    expect(screen.getByText('lock:order:1')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('成功率を計算して表示する', () => {
    vi.mocked(usePolling).mockReturnValue({
      data: {
        locks: {
          'lock:test': { attempts: 10, acquisitions: 8, timeouts: 2, releases: 8, operationSuccesses: 8, operationFailures: 0 },
        },
        timestamp: Date.now(),
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<LockMetricsTable />)
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('テーブルヘッダーを表示する', () => {
    vi.mocked(usePolling).mockReturnValue({
      data: {
        locks: {
          'lock:test': { attempts: 5, acquisitions: 5, timeouts: 0, releases: 5, operationSuccesses: 5, operationFailures: 0 },
        },
        timestamp: Date.now(),
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<LockMetricsTable />)
    expect(screen.getByText('ロックキー')).toBeInTheDocument()
    expect(screen.getByText('試行')).toBeInTheDocument()
    expect(screen.getByText('取得')).toBeInTheDocument()
    expect(screen.getByText('タイムアウト')).toBeInTheDocument()
    expect(screen.getByText('成功率')).toBeInTheDocument()
  })
})
