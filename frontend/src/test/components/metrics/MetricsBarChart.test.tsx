import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MetricsBarChart } from '../../../components/metrics/MetricsBarChart'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null, Cell: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
}))

describe('MetricsBarChart', () => {
  it('renders chart with data', () => {
    const data = [
      { name: 'Lock A', value: 90 },
      { name: 'Lock B', value: 75 },
    ]
    render(<MetricsBarChart data={data} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('shows データなし when data is empty array', () => {
    render(<MetricsBarChart data={[]} />)
    expect(screen.getByText('データなし')).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
  })

  it('applies custom height when empty', () => {
    const { container } = render(<MetricsBarChart data={[]} height={300} />)
    const el = container.querySelector('[style*="height"]') as HTMLElement | null
    expect(el?.style.height).toBe('300px')
  })
})
