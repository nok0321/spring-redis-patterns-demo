import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TtlProgressBar } from '../../../components/cache/TtlProgressBar'

describe('TtlProgressBar', () => {
  it('shows persistent indicator when persistent=true', () => {
    render(<TtlProgressBar ttlMs={-1} persistent={true} />)
    expect(screen.getByText('∞ 永続')).toBeInTheDocument()
  })

  it('shows persistent indicator when ttlMs=-1', () => {
    render(<TtlProgressBar ttlMs={-1} persistent={false} />)
    expect(screen.getByText('∞ 永続')).toBeInTheDocument()
  })

  it('shows dash when ttlMs=-2 (key not found)', () => {
    const { container } = render(<TtlProgressBar ttlMs={-2} persistent={false} />)
    expect(container.textContent).toContain('—')
  })

  it('shows time remaining when ttlMs > 0', () => {
    // 120 seconds = 2m0s
    render(<TtlProgressBar ttlMs={120000} persistent={false} />)
    expect(screen.getByText('2m0s')).toBeInTheDocument()
  })

  it('formats seconds correctly for < 60s', () => {
    render(<TtlProgressBar ttlMs={45000} persistent={false} />)
    expect(screen.getByText('45s')).toBeInTheDocument()
  })

  it('formats hours correctly for >= 3600s', () => {
    // 7200 seconds = 2h0m
    render(<TtlProgressBar ttlMs={7200000} persistent={false} />)
    expect(screen.getByText('2h0m')).toBeInTheDocument()
  })

  it('shows red bar for low TTL ratio (< 10%)', () => {
    // 180s out of 3600s default max = 5% ratio (< 10%)
    const { container } = render(<TtlProgressBar ttlMs={180000} persistent={false} />)
    const bar = container.querySelector('.bg-red-500')
    expect(bar).toBeInTheDocument()
  })

  it('shows green bar for high TTL ratio (>= 50%)', () => {
    // 2000s out of 3600s default max = ~55% ratio
    const { container } = render(<TtlProgressBar ttlMs={2000000} persistent={false} />)
    const bar = container.querySelector('.bg-green-500')
    expect(bar).toBeInTheDocument()
  })

  it('shows yellow bar for medium TTL ratio (10-50%)', () => {
    // 720s out of 3600s default max = 20% ratio
    const { container } = render(<TtlProgressBar ttlMs={720000} persistent={false} />)
    const bar = container.querySelector('.bg-yellow-500')
    expect(bar).toBeInTheDocument()
  })

  it('respects custom maxTtlSeconds', () => {
    // 500s out of 1000s = 50%, green
    const { container } = render(
      <TtlProgressBar ttlMs={500000} persistent={false} maxTtlSeconds={1000} />
    )
    const bar = container.querySelector('.bg-green-500')
    expect(bar).toBeInTheDocument()
  })
})
