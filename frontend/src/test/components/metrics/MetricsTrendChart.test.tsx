import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MetricsTrendChart } from '../../../components/metrics/MetricsTrendChart'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null, Cell: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
}))

describe('MetricsTrendChart', () => {
  const lines = [
    { dataKey: 'operations', color: '#3B82F6', label: '操作数' },
    { dataKey: 'hits', color: '#10B981', label: 'ヒット数' },
  ]

  it('renders chart with data', () => {
    const data = [
      { name: '12:00', operations: 100, hits: 80 },
      { name: '12:01', operations: 120, hits: 90 },
    ]
    render(<MetricsTrendChart data={data} lines={lines} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('shows データなし when data is empty', () => {
    render(<MetricsTrendChart data={[]} lines={lines} />)
    expect(screen.getByText('データなし')).toBeInTheDocument()
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument()
  })

  it('applies custom height when showing データなし', () => {
    const { container } = render(<MetricsTrendChart data={[]} lines={lines} height={300} />)
    const el = container.querySelector('[style*="height"]') as HTMLElement | null
    expect(el?.style.height).toBe('300px')
  })

  it('renders with single data point', () => {
    const data = [{ name: '12:00', operations: 50, hits: 40 }]
    render(<MetricsTrendChart data={data} lines={lines} />)
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })
})
