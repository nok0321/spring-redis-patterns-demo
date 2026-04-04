import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CircuitBreakerMetrics } from '../../../types/health'
import { CircuitBreakerTable } from '../../../components/metrics/CircuitBreakerTable'

describe('CircuitBreakerTable', () => {
  const closedMetrics: CircuitBreakerMetrics = {
    state: 'CLOSED',
    failureRate: 2.5,
    slowCallRate: 1.0,
    numberOfSuccessfulCalls: 95,
    numberOfFailedCalls: 5,
    numberOfSlowCalls: 2,
  }

  const openMetrics: CircuitBreakerMetrics = {
    state: 'OPEN',
    failureRate: 80.0,
    slowCallRate: 60.0,
    numberOfSuccessfulCalls: 10,
    numberOfFailedCalls: 40,
    numberOfSlowCalls: 30,
  }

  const halfOpenMetrics: CircuitBreakerMetrics = {
    state: 'HALF_OPEN',
    failureRate: 30.0,
    slowCallRate: 20.0,
    numberOfSuccessfulCalls: 5,
    numberOfFailedCalls: 3,
    numberOfSlowCalls: 2,
  }

  it('renders table rows for each circuit breaker', () => {
    const data: Record<string, CircuitBreakerMetrics> = {
      redisService: closedMetrics,
    }
    render(<CircuitBreakerTable data={data} />)
    expect(screen.getByText('redisService')).toBeInTheDocument()
    expect(screen.getByText('2.5%')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows CLOSED status badge', () => {
    const data: Record<string, CircuitBreakerMetrics> = {
      svc: closedMetrics,
    }
    render(<CircuitBreakerTable data={data} />)
    expect(screen.getByText('CLOSED')).toBeInTheDocument()
  })

  it('shows OPEN status badge', () => {
    const data: Record<string, CircuitBreakerMetrics> = {
      svc: openMetrics,
    }
    render(<CircuitBreakerTable data={data} />)
    expect(screen.getByText('OPEN')).toBeInTheDocument()
  })

  it('shows HALF_OPEN status badge', () => {
    const data: Record<string, CircuitBreakerMetrics> = {
      svc: halfOpenMetrics,
    }
    render(<CircuitBreakerTable data={data} />)
    expect(screen.getByText('HALF_OPEN')).toBeInTheDocument()
  })

  it('renders multiple circuit breakers', () => {
    const data: Record<string, CircuitBreakerMetrics> = {
      serviceA: closedMetrics,
      serviceB: openMetrics,
    }
    render(<CircuitBreakerTable data={data} />)
    expect(screen.getByText('serviceA')).toBeInTheDocument()
    expect(screen.getByText('serviceB')).toBeInTheDocument()
    expect(screen.getByText('CLOSED')).toBeInTheDocument()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
  })

  it('shows CircuitBreakerデータなし when data is undefined', () => {
    render(<CircuitBreakerTable data={undefined} />)
    expect(screen.getByText('CircuitBreakerデータなし')).toBeInTheDocument()
  })

  it('shows CircuitBreakerデータなし when data is empty object', () => {
    render(<CircuitBreakerTable data={{}} />)
    expect(screen.getByText('CircuitBreakerデータなし')).toBeInTheDocument()
  })
})
