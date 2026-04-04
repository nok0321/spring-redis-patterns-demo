import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MetricsDonutChart } from '../../../components/metrics/MetricsDonutChart'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null, Cell: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
}))

describe('MetricsDonutChart', () => {
  it('renders chart with data having positive values', () => {
    const data = [
      { name: 'Redisヒット', value: 80, color: '#10B981' },
      { name: 'フォールバック', value: 15, color: '#F59E0B' },
      { name: 'エラー', value: 5, color: '#EF4444' },
    ]
    render(<MetricsDonutChart data={data} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('shows データなし when all values are zero', () => {
    const data = [
      { name: 'Redisヒット', value: 0, color: '#10B981' },
      { name: 'フォールバック', value: 0, color: '#F59E0B' },
    ]
    render(<MetricsDonutChart data={data} />)
    expect(screen.getByText('データなし')).toBeInTheDocument()
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument()
  })

  it('shows データなし when data is empty array', () => {
    render(<MetricsDonutChart data={[]} />)
    expect(screen.getByText('データなし')).toBeInTheDocument()
  })

  it('filters out zero-value entries but renders chart if any positive values remain', () => {
    const data = [
      { name: 'Redisヒット', value: 100, color: '#10B981' },
      { name: 'フォールバック', value: 0, color: '#F59E0B' },
    ]
    render(<MetricsDonutChart data={data} />)
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('applies custom height when showing データなし', () => {
    const { container } = render(<MetricsDonutChart data={[]} height={250} />)
    const el = container.querySelector('[style*="height"]') as HTMLElement | null
    expect(el?.style.height).toBe('250px')
  })
})
