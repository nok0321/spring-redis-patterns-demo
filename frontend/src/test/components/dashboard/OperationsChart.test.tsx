import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OperationsChart } from '../../../components/dashboard/OperationsChart'
import type { CacheMetrics } from '../../../types/cache'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  Cell: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
}))

const metrics: CacheMetrics = {
  operations: 100,
  redisHits: 80,
  fallbacks: 2,
  errors: 1,
  hitRate: 0.8,
}

describe('OperationsChart', () => {
  it('null のときデータ収集中メッセージを表示する', () => {
    render(<OperationsChart metrics={null} />)
    expect(screen.getByText('データを収集中...')).toBeInTheDocument()
  })

  it('タイトルを表示する', () => {
    render(<OperationsChart metrics={null} />)
    expect(screen.getByText('キャッシュ操作数')).toBeInTheDocument()
  })

  it('メトリクスが渡されるとチャートを表示する', async () => {
    await act(async () => {
      render(<OperationsChart metrics={metrics} />)
      // queueMicrotask を解消するために一回非同期処理を待つ
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('メトリクス更新後もタイトルを表示する', async () => {
    await act(async () => {
      render(<OperationsChart metrics={metrics} />)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(screen.getByText('キャッシュ操作数')).toBeInTheDocument()
  })
})
