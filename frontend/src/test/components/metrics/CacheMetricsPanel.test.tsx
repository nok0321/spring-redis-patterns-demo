import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { CacheMetrics } from '../../../types/cache'
import { CacheMetricsPanel } from '../../../components/metrics/CacheMetricsPanel'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null, Cell: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
}))

describe('CacheMetricsPanel', () => {
  const trendData = [
    { name: '12:00', operations: 100, hits: 80 },
    { name: '12:01', operations: 120, hits: 90 },
  ]

  it('renders loading state when isLoading is true', () => {
    render(<CacheMetricsPanel data={null} isLoading={true} trendData={trendData} />)
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.getByText('キャッシュメトリクス')).toBeInTheDocument()
  })

  it('does not show metrics cards when loading', () => {
    render(<CacheMetricsPanel data={null} isLoading={true} trendData={trendData} />)
    expect(screen.queryByText('総操作数')).not.toBeInTheDocument()
  })

  it('renders metrics data when loaded', () => {
    const data: CacheMetrics = {
      operations: 1500,
      redisHits: 1200,
      fallbacks: 200,
      errors: 100,
      hitRate: 80.0,
    }
    render(<CacheMetricsPanel data={data} isLoading={false} trendData={trendData} />)
    expect(screen.getByText('キャッシュメトリクス')).toBeInTheDocument()
    expect(screen.getByText('総操作数')).toBeInTheDocument()
    expect(screen.getByText('1,500')).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument()
    expect(screen.getByText('200件')).toBeInTheDocument()
    expect(screen.getByText('100件')).toBeInTheDocument()
  })

  it('handles null data gracefully (shows zeros)', () => {
    render(<CacheMetricsPanel data={null} isLoading={false} trendData={trendData} />)
    expect(screen.getByText('総操作数')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('renders donut chart section', () => {
    const data: CacheMetrics = {
      operations: 500,
      redisHits: 400,
      fallbacks: 50,
      errors: 50,
      hitRate: 80.0,
    }
    render(<CacheMetricsPanel data={data} isLoading={false} trendData={trendData} />)
    expect(screen.getByText('操作の内訳')).toBeInTheDocument()
  })
})
