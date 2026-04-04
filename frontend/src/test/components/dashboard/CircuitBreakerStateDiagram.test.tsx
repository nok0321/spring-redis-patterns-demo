import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CircuitBreakerStateDiagram } from '../../../components/dashboard/CircuitBreakerStateDiagram'

describe('CircuitBreakerStateDiagram', () => {
  it('SVGが描画される', () => {
    const { container } = render(
      <CircuitBreakerStateDiagram state="CLOSED" failureRate={0} slowCallRate={0} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('SVGのaria-labelが設定されている', () => {
    const { container } = render(
      <CircuitBreakerStateDiagram state="CLOSED" failureRate={0} slowCallRate={0} />
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-label', 'Circuit Breaker ステートマシン')
  })

  it('CLOSED ステートのバッジを表示する', () => {
    render(<CircuitBreakerStateDiagram state="CLOSED" failureRate={0} slowCallRate={0} />)
    // The badge text renders the state name
    const badges = screen.getAllByText('CLOSED')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('OPEN ステートのバッジを表示する', () => {
    render(<CircuitBreakerStateDiagram state="OPEN" failureRate={50} slowCallRate={10} />)
    const badges = screen.getAllByText('OPEN')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('HALF_OPEN ステートのバッジを表示する', () => {
    render(<CircuitBreakerStateDiagram state="HALF_OPEN" failureRate={20} slowCallRate={5} />)
    const badges = screen.getAllByText('HALF_OPEN')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('障害率とスロー呼び出し率を表示する', () => {
    render(<CircuitBreakerStateDiagram state="CLOSED" failureRate={12.5} slowCallRate={3.7} />)
    expect(screen.getByText(/12\.5%/)).toBeInTheDocument()
    expect(screen.getByText(/3\.7%/)).toBeInTheDocument()
  })

  it('現在のステートに ● 現在 テキストが表示される', () => {
    render(<CircuitBreakerStateDiagram state="OPEN" failureRate={0} slowCallRate={0} />)
    expect(screen.getByText('● 現在')).toBeInTheDocument()
  })

  it('矢印ラベルが表示される', () => {
    render(<CircuitBreakerStateDiagram state="CLOSED" failureRate={0} slowCallRate={0} />)
    expect(screen.getByText('障害率超過')).toBeInTheDocument()
    expect(screen.getByText('タイムアウト')).toBeInTheDocument()
  })
})
