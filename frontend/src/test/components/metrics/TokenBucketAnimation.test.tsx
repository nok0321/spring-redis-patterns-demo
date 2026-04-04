import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokenBucketAnimation } from '../../../components/metrics/TokenBucketAnimation'

describe('TokenBucketAnimation', () => {
  it('renders SVG bucket structure', () => {
    const { container } = render(
      <TokenBucketAnimation availablePermissions={5} maxPermissions={10} waitingThreads={0} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('displays available permission count', () => {
    render(
      <TokenBucketAnimation availablePermissions={7} maxPermissions={10} waitingThreads={0} />
    )
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('displays max permissions', () => {
    render(
      <TokenBucketAnimation availablePermissions={5} maxPermissions={10} waitingThreads={0} />
    )
    expect(screen.getByText('/ 10')).toBeInTheDocument()
  })

  it('shows トークン残量 label', () => {
    render(
      <TokenBucketAnimation availablePermissions={5} maxPermissions={10} waitingThreads={0} />
    )
    expect(screen.getByText('トークン残量')).toBeInTheDocument()
  })

  it('uses green fill color when ratio > 0.5 (high fill)', () => {
    const { container } = render(
      <TokenBucketAnimation availablePermissions={8} maxPermissions={10} waitingThreads={0} />
    )
    // ratio = 0.8 > 0.5 => fillColor = #22c55e
    const rects = container.querySelectorAll('rect')
    const fillRect = Array.from(rects).find(r => r.getAttribute('fill') === '#22c55e')
    expect(fillRect).toBeInTheDocument()
  })

  it('uses yellow fill color when 0.2 < ratio <= 0.5 (medium fill)', () => {
    const { container } = render(
      <TokenBucketAnimation availablePermissions={3} maxPermissions={10} waitingThreads={0} />
    )
    // ratio = 0.3, between 0.2 and 0.5 => fillColor = #eab308
    const rects = container.querySelectorAll('rect')
    const fillRect = Array.from(rects).find(r => r.getAttribute('fill') === '#eab308')
    expect(fillRect).toBeInTheDocument()
  })

  it('uses red fill color when ratio <= 0.2 (low fill)', () => {
    const { container } = render(
      <TokenBucketAnimation availablePermissions={1} maxPermissions={10} waitingThreads={0} />
    )
    // ratio = 0.1 <= 0.2 => fillColor = #ef4444
    const rects = container.querySelectorAll('rect')
    const fillRect = Array.from(rects).find(r => r.getAttribute('fill') === '#ef4444')
    expect(fillRect).toBeInTheDocument()
  })

  it('shows waiting thread indicator when waitingThreads > 0', () => {
    render(
      <TokenBucketAnimation availablePermissions={2} maxPermissions={10} waitingThreads={3} />
    )
    expect(screen.getByText('3 スレッドが待機中')).toBeInTheDocument()
  })

  it('does not show waiting thread indicator when waitingThreads is 0', () => {
    render(
      <TokenBucketAnimation availablePermissions={5} maxPermissions={10} waitingThreads={0} />
    )
    expect(screen.queryByText(/スレッドが待機中/)).not.toBeInTheDocument()
  })

  it('shows percentage fill level bar', () => {
    render(
      <TokenBucketAnimation availablePermissions={6} maxPermissions={10} waitingThreads={0} />
    )
    // ratio = 0.6 => 60%
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('残量')).toBeInTheDocument()
  })

  it('handles maxPermissions of 0 gracefully (ratio = 0)', () => {
    const { container } = render(
      <TokenBucketAnimation availablePermissions={0} maxPermissions={0} waitingThreads={0} />
    )
    // ratio = 0 => red fill, 0%
    expect(screen.getByText('0%')).toBeInTheDocument()
    const rects = container.querySelectorAll('rect')
    const fillRect = Array.from(rects).find(r => r.getAttribute('fill') === '#ef4444')
    expect(fillRect).toBeInTheDocument()
  })

  it('clamps availablePermissions display to 0 when negative', () => {
    render(
      <TokenBucketAnimation availablePermissions={-1} maxPermissions={10} waitingThreads={0} />
    )
    // Math.max(0, -1) = 0 displayed
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
