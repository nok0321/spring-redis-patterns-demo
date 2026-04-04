import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CacheDetailPage } from '../../pages/CacheDetailPage'

// Mock API
vi.mock('../../api/cache', () => ({
  cacheApi: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getTyped: vi.fn(),
  },
}))

// Mock heavy sub-components
vi.mock('../../components/cache/KeyInfoPanel', () => ({
  KeyInfoPanel: ({ keyName }: { keyName: string; found: boolean; fetchedAt: Date }) => (
    <div data-testid="key-info-panel">{keyName}</div>
  ),
}))

vi.mock('../../components/cache/ValueViewer', () => ({
  ValueViewer: ({ value }: { value: unknown }) => (
    <div data-testid="value-viewer">{String(value)}</div>
  ),
}))

vi.mock('../../components/cache/ValueEditor', () => ({
  ValueEditor: ({
    onSave,
    onCancel,
  }: {
    initialValue: unknown
    onSave: (v: unknown) => void
    onCancel: () => void
  }) => (
    <div data-testid="value-editor">
      <button onClick={() => onSave('edited-value')}>保存</button>
      <button onClick={onCancel}>キャンセル</button>
    </div>
  ),
}))

import { cacheApi } from '../../api/cache'

const mockGet = vi.mocked(cacheApi.get)
const mockSet = vi.mocked(cacheApi.set)
const mockDelete = vi.mocked(cacheApi.delete)

function renderDetailPage(key = 'demo%3Agreeting') {
  return render(
    <MemoryRouter initialEntries={[`/cache/${key}`]}>
      <Routes>
        <Route path="/cache/:key" element={<CacheDetailPage />} />
        <Route path="/cache" element={<div>cache-list-page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CacheDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      key: 'demo:greeting',
      found: true,
      value: 'Hello, Redis!',
    })
    mockSet.mockResolvedValue({ key: 'demo:greeting', success: true, ttl: 'PT5M' })
    mockDelete.mockResolvedValue({ key: 'demo:greeting', deleted: true })
  })

  it('shows loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderDetailPage()
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
  })

  it('renders key name after loading', async () => {
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'demo:greeting' })).toBeInTheDocument()
    })
  })

  it('renders KeyInfoPanel with the key', async () => {
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByTestId('key-info-panel')).toBeInTheDocument()
    })
  })

  it('renders ValueViewer with value', async () => {
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByTestId('value-viewer')).toBeInTheDocument()
      expect(screen.getByText('Hello, Redis!')).toBeInTheDocument()
    })
  })

  it('shows error message when API fails', async () => {
    mockGet.mockRejectedValue(new Error('キーが見つかりません'))
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByText('キーが見つかりません')).toBeInTheDocument()
    })
  })

  it('shows back-to-list link on error', async () => {
    mockGet.mockRejectedValue(new Error('not found'))
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByText('キャッシュ一覧に戻る')).toBeInTheDocument()
    })
  })

  it('clicking back-to-list navigates to /cache', async () => {
    mockGet.mockRejectedValue(new Error('not found'))
    renderDetailPage()
    await waitFor(() => screen.getByText('キャッシュ一覧に戻る'))
    fireEvent.click(screen.getByText('キャッシュ一覧に戻る'))
    await waitFor(() => {
      expect(screen.getByText('cache-list-page')).toBeInTheDocument()
    })
  })

  it('shows edit button when not editing', async () => {
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByText('編集')).toBeInTheDocument()
    })
  })

  it('switches to ValueEditor when 編集 is clicked', async () => {
    renderDetailPage()
    await waitFor(() => screen.getByText('編集'))
    fireEvent.click(screen.getByText('編集'))
    expect(screen.getByTestId('value-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('value-viewer')).not.toBeInTheDocument()
  })

  it('calls cacheApi.set and refreshes when editor saves', async () => {
    mockGet
      .mockResolvedValueOnce({ key: 'demo:greeting', found: true, value: 'Hello, Redis!' })
      .mockResolvedValueOnce({ key: 'demo:greeting', found: true, value: 'edited-value' })

    renderDetailPage()
    await waitFor(() => screen.getByText('編集'))
    fireEvent.click(screen.getByText('編集'))
    await waitFor(() => screen.getByTestId('value-editor'))
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('demo:greeting', { value: 'edited-value' })
    })
  })

  it('cancels editing and returns to viewer', async () => {
    renderDetailPage()
    await waitFor(() => screen.getByText('編集'))
    fireEvent.click(screen.getByText('編集'))
    await waitFor(() => screen.getByTestId('value-editor'))
    fireEvent.click(screen.getByText('キャンセル'))
    await waitFor(() => {
      expect(screen.getByTestId('value-viewer')).toBeInTheDocument()
    })
  })

  it('shows delete button', async () => {
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByText('削除')).toBeInTheDocument()
    })
  })

  it('opens delete confirmation when 削除 is clicked', async () => {
    renderDetailPage()
    await waitFor(() => screen.getByText('削除'))
    fireEvent.click(screen.getByText('削除'))
    await waitFor(() => {
      // DeleteConfirmDialog should appear
      expect(screen.getByText('削除する')).toBeInTheDocument()
    })
  })

  it('calls delete and navigates to /cache after confirmation', async () => {
    renderDetailPage()
    await waitFor(() => screen.getByText('削除'))
    fireEvent.click(screen.getByText('削除'))
    await waitFor(() => screen.getByText('削除する'))
    fireEvent.click(screen.getByText('削除する'))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('demo:greeting')
    })
    await waitFor(() => {
      expect(screen.getByText('cache-list-page')).toBeInTheDocument()
    })
  })

  it('shows キャッシュ一覧 back link on success page', async () => {
    renderDetailPage()
    await waitFor(() => {
      expect(screen.getByText('キャッシュ一覧')).toBeInTheDocument()
    })
  })

  it('decodes URL-encoded key from params', async () => {
    renderDetailPage('demo%3Auser%3Aalice')
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('demo:user:alice')
    })
  })
})
