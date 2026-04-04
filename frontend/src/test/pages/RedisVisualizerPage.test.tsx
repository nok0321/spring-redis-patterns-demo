import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RedisVisualizerPage } from '../../pages/RedisVisualizerPage'

// Mock cacheApi — child sub-components are all defined in the same file, so we do NOT mock them
vi.mock('../../api/cache', () => ({
  cacheApi: {
    searchKeys: vi.fn(),
    batchGet: vi.fn(),
    delete: vi.fn(),
  },
}))

import { cacheApi } from '../../api/cache'

const mockSearchKeys = vi.mocked(cacheApi.searchKeys)
const mockBatchGet = vi.mocked(cacheApi.batchGet)
const mockDelete = vi.mocked(cacheApi.delete)

// Default: return a set of STRING keys
const defaultSearchResult = {
  pattern: '*',
  limit: 200,
  count: 3,
  keys: ['cache:user:1', 'cache:user:2', 'session:abc'],
}

const defaultBatchGetResult = {
  results: {
    'cache:user:1': 'Alice',
    'cache:user:2': 'Bob',
    'session:abc': '{"token":"xyz"}',
  },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RedisVisualizerPage />
    </MemoryRouter>
  )
}

describe('RedisVisualizerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchKeys.mockResolvedValue(defaultSearchResult)
    mockBatchGet.mockResolvedValue(defaultBatchGetResult)
    mockDelete.mockResolvedValue({ key: '', deleted: true })
  })

  it('renders REDIS label in toolbar', async () => {
    renderPage()
    // The toolbar shows "REDIS" in red
    expect(screen.getByText('REDIS')).toBeInTheDocument()
  })

  it('renders Visual Explorer label in toolbar', async () => {
    renderPage()
    expect(screen.getByText('Visual Explorer')).toBeInTheDocument()
  })

  it('pattern input has default value "*"', () => {
    renderPage()
    const patternInput = screen.getByPlaceholderText('pattern: *')
    expect(patternInput).toHaveValue('*')
  })

  it('renders SCAN button after initial load', async () => {
    renderPage()
    // During initial load the button shows '...' — wait for it to become 'SCAN'
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'SCAN' })).toBeInTheDocument()
    })
  })

  it('calls searchKeys and batchGet on initial mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledTimes(1)
      expect(mockBatchGet).toHaveBeenCalledTimes(1)
    })
  })

  it('displays loaded keys in the key list', async () => {
    renderPage()
    await waitFor(() => {
      // Keys can appear more than once (key list + auto-selected detail panel header)
      expect(screen.getAllByText('cache:user:1').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('cache:user:2').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('session:abc').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('calls searchKeys with the pattern from input on SCAN click', async () => {
    renderPage()
    // Wait for initial load to complete
    await waitFor(() => expect(mockSearchKeys).toHaveBeenCalledTimes(1))

    const patternInput = screen.getByPlaceholderText('pattern: *')
    fireEvent.change(patternInput, { target: { value: 'cache:*' } })
    fireEvent.click(screen.getByRole('button', { name: 'SCAN' }))

    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledWith('cache:*', 200)
    })
  })

  it('shows "キーなし" message when no keys are returned', async () => {
    mockSearchKeys.mockResolvedValue({ pattern: '*', limit: 200, count: 0, keys: [] })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/キーなし/)).toBeInTheDocument()
    })
  })

  it('shows total key count in footer', async () => {
    renderPage()
    await waitFor(() => {
      // Footer shows "Total keys" label
      expect(screen.getByText('Total keys')).toBeInTheDocument()
      // 3 keys loaded; the count "3" appears at least once (footer + possibly other places)
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows detail panel when a key is clicked', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('cache:user:1').length).toBeGreaterThanOrEqual(1)
    })
    // Click the key in the sidebar list (first occurrence)
    fireEvent.click(screen.getAllByText('cache:user:1')[0])
    await waitFor(() => {
      // The detail panel header shows STRING type badge (since 'Alice' is a plain string)
      // STRING also appears in the right-panel DATA STRUCTURES list, so use getAllByText
      expect(screen.getAllByText('STRING').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('calls cacheApi.delete when × button is clicked for a key', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTitle('削除').length).toBeGreaterThanOrEqual(1)
    })
    // Each key row has a × delete button; click the first one
    const deleteButtons = screen.getAllByTitle('削除')
    fireEvent.click(deleteButtons[0])
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledTimes(1)
    })
  })

  it('removes deleted key from the list', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTitle('削除').length).toBe(3)
    })
    const deleteButtons = screen.getAllByTitle('削除')
    fireEvent.click(deleteButtons[0])
    await waitFor(() => {
      // One key should have been removed — only 2 delete buttons remain
      expect(screen.getAllByTitle('削除').length).toBe(2)
    })
  })

  it('shows ALL filter button with count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('ALL (3)')).toBeInTheDocument()
    })
  })

  it('shows DATA STRUCTURES panel', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('DATA STRUCTURES')).toBeInTheDocument()
    })
  })

  it('shows error message when searchKeys fails', async () => {
    mockSearchKeys.mockRejectedValue(new Error('Redis 接続エラー'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Redis 接続エラー/)).toBeInTheDocument()
    })
  })

  it('shows scanning indicator while loading', async () => {
    // Use a never-resolving promise so loading state persists
    mockSearchKeys.mockReturnValue(new Promise(() => {}))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Scanning...')).toBeInTheDocument()
    })
  })

  it('shows "スキャン中..." in detail panel placeholder while loading', async () => {
    mockSearchKeys.mockReturnValue(new Promise(() => {}))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('スキャン中...')).toBeInTheDocument()
    })
  })

  it('key filter input filters the displayed keys', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('cache:user:1').length).toBeGreaterThanOrEqual(1)
    })
    const filterInput = screen.getByPlaceholderText(/key filter/)
    fireEvent.change(filterInput, { target: { value: 'session' } })
    await waitFor(() => {
      // cache:user:1 should no longer appear in the key list
      // (it may still appear in the detail panel, so check it's gone from key list)
      const allByUser1 = screen.queryAllByText('cache:user:1')
      // After filtering to 'session', cache:user:1 should not be in the filtered sidebar list
      // The detail panel still shows the auto-selected key so we check count is minimal
      expect(allByUser1.length).toBeLessThanOrEqual(1)
      expect(screen.getAllByText('session:abc').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows "フィルター結果なし" when filter matches nothing', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTitle('削除').length).toBeGreaterThanOrEqual(1)
    })
    const filterInput = screen.getByPlaceholderText(/key filter/)
    fireEvent.change(filterInput, { target: { value: 'nonexistent-key-xyz' } })
    await waitFor(() => {
      expect(screen.getByText('フィルター結果なし')).toBeInTheDocument()
    })
  })

  it('shows Memory estimate in footer', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Memory (est.)')).toBeInTheDocument()
    })
  })

  it('SCAN button submits the form when pattern is entered', async () => {
    renderPage()
    await waitFor(() => expect(mockSearchKeys).toHaveBeenCalledTimes(1))

    const patternInput = screen.getByPlaceholderText('pattern: *')
    fireEvent.change(patternInput, { target: { value: 'session:*' } })

    // Submit via Enter key on the form
    fireEvent.submit(patternInput.closest('form')!)
    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledWith('session:*', 200)
    })
  })
})
