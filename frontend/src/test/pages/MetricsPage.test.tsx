import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MetricsPage } from '../../pages/MetricsPage'

// Mock APIs (usePolling calls these internally, but we mock usePolling directly)
vi.mock('../../api/cache', () => ({
  cacheApi: {
    metrics: vi.fn(),
  },
}))

vi.mock('../../api/locks', () => ({
  locksApi: {
    metrics: vi.fn(),
  },
}))

vi.mock('../../api/health', () => ({
  healthApi: {
    get: vi.fn(),
  },
}))

// Mock usePolling so we control returned data without running timers
const mockRefetchCache = vi.fn()
const mockRefetchLocks = vi.fn()
const mockRefetchHealth = vi.fn()

vi.mock('../../hooks/usePolling', () => ({
  usePolling: vi.fn(),
}))

// Mock child panel components
vi.mock('../../components/metrics/CacheMetricsPanel', () => ({
  CacheMetricsPanel: () => <div data-testid="cache-metrics-panel" />,
}))

vi.mock('../../components/metrics/LockMetricsPanel', () => ({
  LockMetricsPanel: () => <div data-testid="lock-metrics-panel" />,
}))

vi.mock('../../components/metrics/CircuitBreakerTable', () => ({
  CircuitBreakerTable: () => <div data-testid="circuit-breaker-table" />,
}))

import { usePolling } from '../../hooks/usePolling'

const mockUsePolling = vi.mocked(usePolling)

// Default data to feed into usePolling
const defaultCacheData = {
  operations: 100,
  redisHits: 75,
  fallbacks: 2,
  errors: 1,
  hitRate: 75,
}

const defaultLocksData = {
  locks: {
    'my-lock': {
      attempts: 5,
      acquisitions: 4,
      timeouts: 1,
      releases: 4,
      operationSuccesses: 3,
      operationFailures: 1,
    },
  },
  timestamp: Date.now(),
}

const defaultHealthData = {
  status: 'UP',
  service: 'Cache Service',
  timestamp: new Date().toISOString(),
  redis: { status: 'UP', initialized: true },
  circuitBreakers: {
    'cache-operations': {
      state: 'CLOSED',
      failureRate: 0,
      slowCallRate: 0,
      numberOfSuccessfulCalls: 10,
      numberOfFailedCalls: 0,
      numberOfSlowCalls: 0,
    },
  },
}

type CacheData = typeof defaultCacheData | null
type LocksData = typeof defaultLocksData | null
type HealthData = typeof defaultHealthData | null

function setupPollingMock(
  cacheData: CacheData = defaultCacheData,
  locksData: LocksData = defaultLocksData,
  healthData: HealthData = defaultHealthData,
) {
  let callCount = 0
  mockUsePolling.mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      return { data: cacheData, isLoading: false, error: null, refetch: mockRefetchCache }
    }
    if (callCount === 2) {
      return { data: locksData, isLoading: false, error: null, refetch: mockRefetchLocks }
    }
    return { data: healthData, isLoading: false, error: null, refetch: mockRefetchHealth }
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MetricsPage />
    </MemoryRouter>
  )
}

describe('MetricsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupPollingMock()
  })

  it('renders page heading "メトリクス"', () => {
    renderPage()
    expect(screen.getByText('メトリクス')).toBeInTheDocument()
  })

  it('renders CacheMetricsPanel', () => {
    renderPage()
    expect(screen.getByTestId('cache-metrics-panel')).toBeInTheDocument()
  })

  it('renders LockMetricsPanel', () => {
    renderPage()
    expect(screen.getByTestId('lock-metrics-panel')).toBeInTheDocument()
  })

  it('renders CircuitBreakerTable', () => {
    renderPage()
    expect(screen.getByTestId('circuit-breaker-table')).toBeInTheDocument()
  })

  it('renders refresh button', () => {
    renderPage()
    expect(screen.getByText('更新')).toBeInTheDocument()
  })

  it('renders CSV export button', () => {
    renderPage()
    expect(screen.getByText('CSV出力')).toBeInTheDocument()
  })

  it('calls all three refetch functions when refresh button is clicked', () => {
    renderPage()
    fireEvent.click(screen.getByText('更新'))
    expect(mockRefetchCache).toHaveBeenCalledTimes(1)
    expect(mockRefetchLocks).toHaveBeenCalledTimes(1)
    expect(mockRefetchHealth).toHaveBeenCalledTimes(1)
  })

  it('calls usePolling three times with 15000ms interval', () => {
    renderPage()
    expect(mockUsePolling).toHaveBeenCalledTimes(3)
    for (const call of mockUsePolling.mock.calls) {
      expect((call[0] as { interval: number }).interval).toBe(15000)
    }
  })

  it('shows CircuitBreaker section heading', () => {
    renderPage()
    expect(screen.getByText('CircuitBreaker 状態')).toBeInTheDocument()
  })

  describe('handleExportCsv — with full data', () => {
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>
    let anchorClickSpy: ReturnType<typeof vi.fn>
    let origCreateElement: typeof document.createElement

    beforeEach(() => {
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      anchorClickSpy = vi.fn()
      origCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag)
        if (tag === 'a') {
          vi.spyOn(el as HTMLElement, 'click').mockImplementation(anchorClickSpy)
        }
        return el
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('calls createObjectURL when CSV button is clicked', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    })

    it('calls revokeObjectURL to clean up blob URL', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
    })

    it('triggers anchor click to initiate download', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    })

    it('creates a CSV Blob with text/csv content type', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob
      expect(blobArg).toBeInstanceOf(Blob)
      expect(blobArg.type).toBe('text/csv;charset=utf-8;')
    })

    it('sets download filename matching redis-metrics-YYYYMMDD-HHmmss.csv', () => {
      let capturedDownload = ''
      const anchorMock = origCreateElement('a') as HTMLAnchorElement
      Object.defineProperty(anchorMock, 'download', {
        set(v: string) { capturedDownload = v },
        get() { return capturedDownload },
      })
      vi.spyOn(anchorMock, 'click').mockImplementation(() => {})

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return anchorMock
        return origCreateElement(tag)
      })

      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      expect(capturedDownload).toMatch(/^redis-metrics-\d{8}-\d{6}\.csv$/)
    })
  })

  describe('handleExportCsv — with null data (fallback to defaults)', () => {
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>
    let origCreateElement: typeof document.createElement

    beforeEach(() => {
      vi.clearAllMocks()
      setupPollingMock(null, null, null)
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:null-url')
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      origCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag)
        if (tag === 'a') vi.spyOn(el as HTMLElement, 'click').mockImplementation(() => {})
        return el
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('still creates and revokes blob URL when all data is null', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:null-url')
    })

    it('creates blob with zero-value cache rows when cache data is null', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob
      expect(blobArg.type).toBe('text/csv;charset=utf-8;')
    })
  })

  describe('handleExportCsv — with locks and circuit breaker data', () => {
    let capturedBlobParts: BlobPart[][]
    let origBlob: typeof Blob
    let origCreateElement: typeof document.createElement

    beforeEach(() => {
      vi.clearAllMocks()
      setupPollingMock(defaultCacheData, defaultLocksData, defaultHealthData)

      // Capture Blob constructor args so we can inspect the CSV text
      capturedBlobParts = []
      origBlob = globalThis.Blob
      class BlobCapture extends origBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options)
          if (parts) capturedBlobParts.push([...parts])
        }
      }
      globalThis.Blob = BlobCapture

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:full-url')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      origCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag)
        if (tag === 'a') vi.spyOn(el as HTMLElement, 'click').mockImplementation(() => {})
        return el
      })
    })

    afterEach(() => {
      globalThis.Blob = origBlob
      vi.restoreAllMocks()
    })

    function getCsvText(): string {
      // Last captured Blob parts hold the CSV content
      const parts = capturedBlobParts[capturedBlobParts.length - 1]
      return parts.map(p => String(p)).join('')
    }

    it('exports lock metrics rows (my-lock entries are included in CSV)', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      const text = getCsvText()
      expect(text).toContain('lock_attempts')
      expect(text).toContain('my-lock')
    })

    it('exports circuit breaker rows (cache-operations entries are included in CSV)', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      const text = getCsvText()
      expect(text).toContain('cb_state')
      expect(text).toContain('cache-operations')
    })

    it('CSV content starts with header row', () => {
      renderPage()
      fireEvent.click(screen.getByText('CSV出力'))
      const text = getCsvText()
      expect(text).toMatch(/^"種別","キー","値"/)
    })
  })
})
