import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorSummary } from '../../../components/dashboard/ErrorSummary'
import type { CacheMetrics } from '../../../types/cache'
import type { CircuitBreakerMetrics } from '../../../types/health'

const defaultMetrics: CacheMetrics = {
  operations: 100,
  redisHits: 80,
  fallbacks: 0,
  errors: 0,
  hitRate: 0.8,
}

describe('ErrorSummary', () => {
  it('ヘッダータイトルを表示する', () => {
    render(<ErrorSummary cacheMetrics={null} circuitBreakers={undefined} />)
    expect(screen.getByText('エラー・フォールバック')).toBeInTheDocument()
  })

  it('null のとき 0 件を表示する', () => {
    render(<ErrorSummary cacheMetrics={null} circuitBreakers={undefined} />)
    const counts = screen.getAllByText('0 件')
    expect(counts).toHaveLength(2)
  })

  it('フォールバック件数を表示する', () => {
    render(<ErrorSummary cacheMetrics={{ ...defaultMetrics, fallbacks: 3 }} circuitBreakers={undefined} />)
    expect(screen.getByText('3 件')).toBeInTheDocument()
  })

  it('エラー件数を表示する', () => {
    render(<ErrorSummary cacheMetrics={{ ...defaultMetrics, errors: 5 }} circuitBreakers={undefined} />)
    expect(screen.getByText('5 件')).toBeInTheDocument()
  })

  it('CB失敗率が 0 のとき 0.0% を表示する', () => {
    render(<ErrorSummary cacheMetrics={null} circuitBreakers={undefined} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('CB失敗率の平均を表示する', () => {
    const circuitBreakers: Record<string, CircuitBreakerMetrics> = {
      cacheService: { state: 'CLOSED', failureRate: 10, slowCallRate: 5, numberOfSuccessfulCalls: 90, numberOfFailedCalls: 10, numberOfSlowCalls: 5 },
      lockService: { state: 'CLOSED', failureRate: 20, slowCallRate: 2, numberOfSuccessfulCalls: 80, numberOfFailedCalls: 20, numberOfSlowCalls: 2 },
    }
    render(<ErrorSummary cacheMetrics={null} circuitBreakers={circuitBreakers} />)
    // Average of 10 and 20 = 15.0
    expect(screen.getByText('15.0%')).toBeInTheDocument()
  })

  it('circuitBreakers が undefined のとき 0.0%', () => {
    render(<ErrorSummary cacheMetrics={defaultMetrics} circuitBreakers={undefined} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })
})
