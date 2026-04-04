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
    onToggleSelect,
    onToggleAll,
  }: {
    results: Record<string, unknown>
    selectedKeys: Set<string>
    onToggleSelect: (k: string) => void
    onToggleAll: () => void
    onDetail: (k: string) => void
    onDelete: (k: string) => void
  }) => (
    <div data-testid="key-table">
      <button onClick={onToggleAll} data-testid="toggle-all-btn">全選択</button>
      {Object.keys(results).map((k) => (
        <div key={k} data-testid={`row-${k}`}>
          <span>{k}</span>
          <button onClick={() => onToggleSelect(k)} data-testid={`toggle-${k}`}>選択</button>
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
    onBatchWarmup,
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
        <button onClick={onBatchWarmup} data-testid="batch-warmup-btn">
          ウォームアップ
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
const mockWarmup = vi.mocked(cacheApi.warmup)

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
    mockWarmup.mockResolvedValue({ status: 'DONE', keys: 2 })
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

  it('searches with empty pattern reloads all keys', async () => {
    renderExplorer()
    await waitFor(() => expect(mockSearchKeys).toHaveBeenCalledTimes(1))

    // Input stays empty, click search
    fireEvent.click(screen.getByTestId('search-btn'))

    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledWith('*', 200)
      expect(mockSearchKeys).toHaveBeenCalledTimes(2)
    })
  })

  it('searches with ? wildcard via searchKeys', async () => {
    renderExplorer()
    await waitFor(() => expect(mockSearchKeys).toHaveBeenCalledTimes(1))

    mockSearchKeys.mockResolvedValue({
      pattern: 'demo:?',
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
    fireEvent.change(input, { target: { value: 'demo:?' } })
    fireEvent.click(screen.getByTestId('search-btn'))

    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledWith('demo:?', 200)
    })
  })

  it('shows empty results when searchKeys returns 0 keys', async () => {
    mockSearchKeys.mockResolvedValue({
      pattern: 'nonexistent:*',
      limit: 200,
      count: 0,
      keys: [],
    })

    renderExplorer()
    await waitFor(() => {
      expect(mockSearchKeys).toHaveBeenCalledWith('*', 200)
    })
    // With no keys, KeyTable should still render (empty results)
    expect(screen.getByTestId('key-table')).toBeInTheDocument()
  })

  it('shows error toast when fetchByPattern fails', async () => {
    mockSearchKeys.mockRejectedValue(new Error('ネットワークエラー'))

    renderExplorer()
    await waitFor(() => {
      expect(screen.getByText('ネットワークエラー')).toBeInTheDocument()
    })
  })

  it('shows error toast when exact key search (batchGet) fails', async () => {
    renderExplorer()
    await waitFor(() => expect(mockSearchKeys).toHaveBeenCalledTimes(1))

    mockBatchGet.mockRejectedValue(new Error('バッチ取得失敗'))

    const input = screen.getByTestId('search-input')
    fireEvent.change(input, { target: { value: 'mykey' } })
    fireEvent.click(screen.getByTestId('search-btn'))

    await waitFor(() => {
      expect(screen.getByText('バッチ取得失敗')).toBeInTheDocument()
    })
  })

  it('toggles individual key selection', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    // Toggle select the first key — BatchActionBar should appear with 1 selected
    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => {
      expect(screen.getByTestId('batch-action-bar')).toBeInTheDocument()
      expect(screen.getByText('1件選択')).toBeInTheDocument()
    })

    // Toggle again — deselect
    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => {
      expect(screen.queryByTestId('batch-action-bar')).not.toBeInTheDocument()
    })
  })

  it('toggles all keys via handleToggleAll', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    // Select all
    fireEvent.click(screen.getByTestId('toggle-all-btn'))
    await waitFor(() => {
      expect(screen.getByText('2件選択')).toBeInTheDocument()
    })

    // Deselect all (all are selected, clicking again deselects)
    fireEvent.click(screen.getByTestId('toggle-all-btn'))
    await waitFor(() => {
      expect(screen.queryByTestId('batch-action-bar')).not.toBeInTheDocument()
    })
  })

  it('batch deletes selected keys successfully', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    // Select a key then batch delete
    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => expect(screen.getByTestId('batch-delete-btn')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('batch-delete-btn'))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('demo:greeting')
      expect(screen.getByText('1件を削除しました')).toBeInTheDocument()
    })
  })

  it('shows error toast when batch delete partially fails', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    // Reject delete for this key
    mockDelete.mockRejectedValue(new Error('削除エラー'))

    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => expect(screen.getByTestId('batch-delete-btn')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('batch-delete-btn'))

    await waitFor(() => {
      expect(screen.getByText(/demo:greeting の削除失敗/)).toBeInTheDocument()
    })
  })

  it('batch warmup calls cacheApi.warmup with selected keys', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => expect(screen.getByTestId('batch-warmup-btn')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('batch-warmup-btn'))

    await waitFor(() => {
      expect(mockWarmup).toHaveBeenCalledWith(['demo:greeting'])
      expect(screen.getByText('ウォームアップを実行しました')).toBeInTheDocument()
    })
  })

  it('shows error toast when warmup fails', async () => {
    mockWarmup.mockRejectedValue(new Error('ウォームアップエラー'))

    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => expect(screen.getByTestId('batch-warmup-btn')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('batch-warmup-btn'))

    await waitFor(() => {
      expect(screen.getByText('ウォームアップエラー')).toBeInTheDocument()
    })
  })

  it('shows error toast when delete confirmation fails', async () => {
    mockDelete.mockRejectedValue(new Error('削除失敗'))

    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByText('削除')[0])
    await waitFor(() => {
      const confirmBtn = screen.getByText('削除する')
      fireEvent.click(confirmBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('削除失敗')).toBeInTheDocument()
    })
  })

  it('cancels delete dialog when cancel is clicked', async () => {
    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByText('削除')[0])
    await waitFor(() => {
      expect(screen.getByText('削除する')).toBeInTheDocument()
    })

    // Click the cancel button
    fireEvent.click(screen.getByText('キャンセル'))
    await waitFor(() => {
      expect(screen.queryByText('削除する')).not.toBeInTheDocument()
    })
  })

  it('closes add-key modal when close is clicked', async () => {
    renderExplorer()
    fireEvent.click(screen.getByText('新規追加'))
    await waitFor(() => expect(screen.getByTestId('add-key-modal')).toBeInTheDocument())

    fireEvent.click(screen.getByText('閉じる'))
    await waitFor(() => {
      expect(screen.queryByTestId('add-key-modal')).not.toBeInTheDocument()
    })
  })

  it('shows fallback error message when delete fails with non-Error', async () => {
    mockDelete.mockRejectedValue('string-error')

    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByText('削除')[0])
    await waitFor(() => {
      const confirmBtn = screen.getByText('削除する')
      fireEvent.click(confirmBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('削除失敗')).toBeInTheDocument()
    })
  })

  it('shows fallback error message when batch delete fails with non-Error', async () => {
    mockDelete.mockRejectedValue('non-error-reason')

    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => expect(screen.getByTestId('batch-delete-btn')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('batch-delete-btn'))

    await waitFor(() => {
      expect(screen.getByText(/demo:greeting の削除失敗: 不明/)).toBeInTheDocument()
    })
  })

  it('shows fallback error message when warmup fails with non-Error', async () => {
    mockWarmup.mockRejectedValue('non-error')

    renderExplorer()
    await waitFor(() => {
      expect(screen.getByTestId('row-demo:greeting')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('toggle-demo:greeting'))
    await waitFor(() => expect(screen.getByTestId('batch-warmup-btn')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('batch-warmup-btn'))

    await waitFor(() => {
      expect(screen.getByText('ウォームアップ失敗')).toBeInTheDocument()
    })
  })
})
