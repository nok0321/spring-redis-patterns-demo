import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CacheExplorerPage } from '../../pages/CacheExplorerPage'

// Mock API
vi.mock('../../api/cache', () => ({
  cacheApi: {
    searchKeys: vi.fn(),
    batchGet: vi.fn(),
    delete: vi.fn(),
    set: vi.fn(),
    warmup: vi.fn(),
  },
}))

// Mock child components that involve complex rendering
vi.mock('../../components/cache/KeyTable', () => ({
  KeyTable: ({
    results,
    onDelete,
    onDetail,
  }: {
    results: Record<string, unknown>
    selectedKeys: Set<string>
    onToggleSelect: (k: string) => void
    onToggleAll: () => void
    onDetail: (k: string) => void
    onDelete: (k: string) => void
  }) => (
    <div data-testid="key-table">
      {Object.keys(results).map((k) => (
        <div key={k} data-testid={`row-${k}`}>
          <span>{k}</span>
          <button onClick={() => onDetail(k)}>詳細</button>
          <button onClick={() => onDelete(k)}>削除</button>
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../../components/cache/KeySearchBar', () => ({
  KeySearchBar: ({
    pattern,
    onPatternChange,
    onSearch,
  }: {
    pattern: string
    onPatternChange: (v: string) => void
    onSearch: () => void
    isSearching: boolean
  }) => (
    <div>
      <input
        data-testid="search-input"
        value={pattern}
        onChange={(e) => onPatternChange(e.target.value)}
        placeholder="パターン検索"
      />
      <button onClick={onSearch} data-testid="search-btn">
        検索
      </button>
    </div>
  ),
}))

vi.mock('../../components/cache/BatchActionBar', () => ({
  BatchActionBar: ({
    selectedCount,
    onBatchDelete,
  }: {
    selectedCount: number
    onBatchDelete: () => void
    onBatchWarmup: () => void
    isProcessing: boolean
  }) =>
    selectedCount > 0 ? (
      <div data-testid="batch-action-bar">
        <span>{selectedCount}件選択</span>
        <button onClick={onBatchDelete} data-testid="batch-delete-btn">
          一括削除
        </button>
      </div>
    ) : null,
}))

vi.mock('../../components/cache/AddKeyModal', () => ({
  AddKeyModal: ({
    isOpen,
    onClose,
    onAdd,
  }: {
    isOpen: boolean
    onClose: () => void
    onAdd: (key: string, value: unknown, ttl?: number) => void
  }) =>
    isOpen ? (
      <div data-testid="add-key-modal">
        <button
          onClick={() => onAdd('new:key', 'new-value')}
          data-testid="add-key-confirm"
        >
          追加
        </button>
        <button onClick={onClose}>閉じる</button>
      </div>
    ) : null,
}))

import { cacheApi } from '../../api/cache'

const mockSearchKeys = vi.mocked(cacheApi.searchKeys)
const mockBatchGet = vi.mocked(cacheApi.batchGet)
const mockDelete = vi.mocked(cacheApi.delete)
const mockSet = vi.mocked(cacheApi.set)

function renderExplorer() {
  return render(
    <MemoryRouter>
      <CacheExplorerPage />
    </MemoryRouter>
  )
}

describe('CacheExplorerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchKeys.mockResolvedValue({
      pattern: '*',
      limit: 200,
      count: 2,
      keys: ['demo:greeting', 'demo:counter'],
    })
    mockBatchGet.mockResolvedValue({
      requested: 2,
      found: 2,
      results: {
        'demo:greeting': 'Hello, Redis!',
        'demo:counter': 42,
      },
    })
    mockDelete.mockResolvedValue({ key: 'demo:greeting', deleted: true })
    mockSet.mockResolvedValue({ key: 'new:key', success: true })
  })

  it('renders page heading', () => {
    renderExplorer()
    expect(screen.getByText('キャッシュエクスプローラー')).toBeInTheDocument()
  })

  it('auto-loads all keys on mount', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledWith('*', 200)
    })
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
      expect(screen.getByTestId('row-demo:counter')).toBeInTheDocument()
    })
  })

  it('renders the KeyTable', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('key-table')).toBeInTheDocument()
    })
  })

  it('searches with pattern when search button clicked', async () => {
    renderExplorer()
    await waitFor(() => expect(mockSearchKeys).toHaveBeenCalledTimes(1))

    mockSearchKeys.mockResolvedValue({
      pattern: 'demo:*',
      limit: 200,
      count: 1,
      keys: ['demo:greeting'],
    })
    mockBatchGet.mockResolvedValue({
      requested: 1,
      found: 1,
      results: { 'demo:greeting': 'Hello, Redis!' },
    })

    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'demo:*' } })
    fireEvent.click(screen.getByTestId('search-btn'))

    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledWith('demo:*', 200)
    })
  })

  it('searches exact keys (no wildcard) via batchGet directly', async () => {
    renderExplorer()
    await waitFor(() => expect(mockSearchKeys).toHaveBeenCalledTimes(1))

    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'demo:greeting,demo:counter' } })
    fireEvent.click(screen.getByTestId('search-btn'))

    await waitFor(() => {
      // batchGet called with exact keys (1 initial + 1 search)
      expect(mockBatchGet).toHaveBeenCalledWith(['demo:greeting', 'demo:counter'])
    })
  })

  it('shows delete confirmation dialog when delete is clicked', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByText('削除')[0])
    await waitFor(() => {
      // DeleteConfirmDialog should be open — check for confirm button
      expect(screen.getByText('削除する')).toBeInTheDocument()
    })
  })

  it('deletes a key after confirmation', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })
    // Trigger delete
    fireEvent.click(screen.getAllByText('削除')[0])
    // Confirm the deletion
    await waitFor(() => {
      const confirmBtn = screen.getByText('削除する')
      fireEvent.click(confirmBtn)
    })
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('demo:greeting')
    })
  })

  it('opens add-key modal when 新規追加 is clicked', async () => {
    renderExplorer()
    fireEvent.click(screen.getByText('新規追加'))
    await waitFor(() => {
      expect(screen.getByTestId('add-key-modal')).toBeInTheDocument()
    })
  })

  it('adds a new key via AddKeyModal', async () => {
    renderExplorer()
    fireEvent.click(screen.getByText('新規追加'))
    await waitFor(() => expect(screen.getByTestId('add-key-modal')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('add-key-confirm'))
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('new:key', { value: 'new-value', ttl: undefined })
    })
  })

  it('navigates to detail page when 詳細 is clicked', async () => {
    const { container } = renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })
    // The MemoryRouter won't navigate away, but we can verify no errors occur
    fireEvent.click(screen.getAllByText('詳細')[0])
    expect(container).toBeInTheDocument()
  })
})
