import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { LockMetricsResponse } from '../../../types/locks'
import { LockMetricsPanel } from '../../../components/metrics/LockMetricsPanel'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null, Cell: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
}))

describe('LockMetricsPanel', () => {
  it('renders loading state when isLoading is true', () => {
    render(<LockMetricsPanel data={null} isLoading={true} />)
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.getByText('ロックメトリクス')).toBeInTheDocument()
  })

  it('does not show metric cards when loading', () => {
    render(<LockMetricsPanel data={null} isLoading={true} />)
    expect(screen.queryByText('総ロック試行')).not.toBeInTheDocument()
  })

  it('renders metrics data with lock stats', () => {
    const data: LockMetricsResponse = {
      locks: {
        'lock:key1': {
          attempts: 100,
          acquisitions: 95,
          timeouts: 3,
          releases: 95,
          operationSuccesses: 90,
          operationFailures: 5,
        },
        'lock:key2': {
          attempts: 50,
          acquisitions: 48,
          timeouts: 1,
          releases: 48,
          operationSuccesses: 45,
          operationFailures: 3,
        },
      },
      timestamp: Date.now(),
    }
    render(<LockMetricsPanel data={data} isLoading={false} />)
    expect(screen.getByText('ロックメトリクス')).toBeInTheDocument()
    expect(screen.getByText('総ロック試行')).toBeInTheDocument()
    // total attempts = 150
    expect(screen.getByText('150')).toBeInTheDocument()
    // total timeouts = 4件
    expect(screen.getByText('4件')).toBeInTheDocument()
  })

  it('renders acquisition rate correctly', () => {
    const data: LockMetricsResponse = {
      locks: {
        'lock:test': {
          attempts: 100,
          acquisitions: 80,
          timeouts: 5,
          releases: 80,
          operationSuccesses: 75,
          operationFailures: 5,
        },
      },
      timestamp: Date.now(),
    }
    render(<LockMetricsPanel data={data} isLoading={false} />)
    // 80/100 = 80.0%
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('handles null data (shows zeros)', () => {
    render(<LockMetricsPanel data={null} isLoading={false} />)
    expect(screen.getByText('総ロック試行')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('0件')).toBeInTheDocument()
  })

  it('renders bar chart section for lock success rates', () => {
    const data: LockMetricsResponse = {
      locks: {
        'lock:key': {
          attempts: 10,
          acquisitions: 9,
          timeouts: 0,
          releases: 9,
          operationSuccesses: 9,
          operationFailures: 0,
        },
      },
      timestamp: Date.now(),
    }
    render(<LockMetricsPanel data={data} isLoading={false} />)
    expect(screen.getByText('ロック別取得成功率（上位10件）')).toBeInTheDocument()
  })
})
