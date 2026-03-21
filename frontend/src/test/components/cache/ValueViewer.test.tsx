import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ValueViewer } from '../../../components/cache/ValueViewer'

// Mock the child viewer components
vi.mock('../../../components/cache/HashViewer', () => ({
  HashViewer: ({ value }: { value: Record<string, unknown> }) => (
    <div data-testid="hash-viewer">{JSON.stringify(value)}</div>
  ),
}))
vi.mock('../../../components/cache/ListViewer', () => ({
  ListViewer: ({ value }: { value: unknown[] }) => (
    <div data-testid="list-viewer">{JSON.stringify(value)}</div>
  ),
}))
vi.mock('../../../components/cache/SetViewer', () => ({
  SetViewer: ({ value }: { value: unknown[] }) => (
    <div data-testid="set-viewer">{JSON.stringify(value)}</div>
  ),
}))
vi.mock('../../../components/cache/ZSetViewer', () => ({
  ZSetViewer: ({ value }: { value: unknown[] }) => (
    <div data-testid="zset-viewer">{JSON.stringify(value)}</div>
  ),
}))

// Mock the cache API
vi.mock('../../../api/cache', () => ({
  cacheApi: {
    getTyped: vi.fn(),
  },
}))

import { cacheApi } from '../../../api/cache'

const mockGetTyped = vi.mocked(cacheApi.getTyped)

describe('ValueViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders raw string value when no cacheKey given', () => {
    render(<ValueViewer value="hello world" />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders JSON-stringified object when no cacheKey given', () => {
    const obj = { name: 'Alice', age: 30 }
    render(<ValueViewer value={obj} />)
    const pre = document.querySelector('pre')
    expect(pre).toBeInTheDocument()
    expect(pre?.textContent).toContain('"name": "Alice"')
  })

  it('shows loading state while fetching typed value', async () => {
    // Make getTyped never resolve so we can see the loading state
    mockGetTyped.mockReturnValue(new Promise(() => {}))
    render(<ValueViewer value="raw" cacheKey="demo:greeting" />)
    expect(screen.getByText('型情報を取得中...')).toBeInTheDocument()
  })

  it('renders OBJECT type as raw pre block', async () => {
    mockGetTyped.mockResolvedValue({ key: 'demo:greeting', type: 'OBJECT', value: 'Hello, Redis!' })
    render(<ValueViewer value="raw" cacheKey="demo:greeting" />)
    await waitFor(() => {
      expect(screen.queryByText('型情報を取得中...')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Hello, Redis!')).toBeInTheDocument()
  })

  it('renders MAP type with HashViewer', async () => {
    const mapValue = { field1: 'val1', field2: 'val2' }
    mockGetTyped.mockResolvedValue({ key: 'demo:map', type: 'MAP', value: mapValue })
    render(<ValueViewer value={null} cacheKey="demo:map" />)
    await waitFor(() => {
      expect(screen.getByTestId('hash-viewer')).toBeInTheDocument()
    })
  })

  it('renders HASH type with HashViewer', async () => {
    const hashValue = { field: 'value' }
    mockGetTyped.mockResolvedValue({ key: 'demo:hash', type: 'HASH', value: hashValue })
    render(<ValueViewer value={null} cacheKey="demo:hash" />)
    await waitFor(() => {
      expect(screen.getByTestId('hash-viewer')).toBeInTheDocument()
    })
  })

  it('renders LIST type with ListViewer', async () => {
    const listValue = ['a', 'b', 'c']
    mockGetTyped.mockResolvedValue({ key: 'demo:list', type: 'LIST', value: listValue })
    render(<ValueViewer value={null} cacheKey="demo:list" />)
    await waitFor(() => {
      expect(screen.getByTestId('list-viewer')).toBeInTheDocument()
    })
  })

  it('renders SET type with SetViewer', async () => {
    const setValue = ['x', 'y', 'z']
    mockGetTyped.mockResolvedValue({ key: 'demo:set', type: 'SET', value: setValue })
    render(<ValueViewer value={null} cacheKey="demo:set" />)
    await waitFor(() => {
      expect(screen.getByTestId('set-viewer')).toBeInTheDocument()
    })
  })

  it('renders SORTED_SET type with ZSetViewer', async () => {
    const zsetValue = [{ score: 1.0, value: 'member1' }]
    mockGetTyped.mockResolvedValue({ key: 'demo:zset', type: 'SORTED_SET', value: zsetValue })
    render(<ValueViewer value={null} cacheKey="demo:zset" />)
    await waitFor(() => {
      expect(screen.getByTestId('zset-viewer')).toBeInTheDocument()
    })
  })

  it('falls back to pre block on API error', async () => {
    mockGetTyped.mockRejectedValue(new Error('Not found'))
    render(<ValueViewer value="fallback-value" cacheKey="missing:key" />)
    await waitFor(() => {
      expect(screen.queryByText('型情報を取得中...')).not.toBeInTheDocument()
    })
    // Should show the raw value as fallback
    expect(screen.getByText('fallback-value')).toBeInTheDocument()
  })

  it('displays STRING type badge', async () => {
    // No cacheKey → defaults to STRING badge
    render(<ValueViewer value="test" />)
    expect(screen.getByText('STRING')).toBeInTheDocument()
  })

  it('displays type badge from API response', async () => {
    mockGetTyped.mockResolvedValue({ key: 'demo:greeting', type: 'OBJECT', value: 'Hello' })
    render(<ValueViewer value="raw" cacheKey="demo:greeting" />)
    await waitFor(() => {
      expect(screen.getByText('OBJECT')).toBeInTheDocument()
    })
  })

  it('shows 値 heading', () => {
    render(<ValueViewer value="test" />)
    expect(screen.getByText('値')).toBeInTheDocument()
  })
})
