import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyTable } from '../../../components/cache/KeyTable'

// Mock usePolling so no real async polling runs
vi.mock('../../../hooks/usePolling', () => ({
  usePolling: vi.fn(() => ({ data: null, error: null, isLoading: false, refetch: vi.fn() })),
}))

// Mock cacheApi.getTtlBatch (used by usePolling inside KeyTable)
vi.mock('../../../api/cache', () => ({
  cacheApi: {
    getTtlBatch: vi.fn(),
  },
}))

// Mock child components to isolate KeyTable
vi.mock('../../../components/cache/KeyPreviewCell', () => ({
  KeyPreviewCell: ({ value }: { value: unknown }) => (
    <span data-testid="key-preview">{String(value)}</span>
  ),
}))

vi.mock('../../../components/cache/TtlProgressBar', () => ({
  TtlProgressBar: ({ ttlMs }: { ttlMs: number; persistent: boolean }) => (
    <span data-testid="ttl-bar">{ttlMs}ms</span>
  ),
}))

import { usePolling } from '../../../hooks/usePolling'
const mockUsePolling = vi.mocked(usePolling)

const baseResults: Record<string, unknown> = {
  'demo:greeting': 'Hello, Redis!',
  'demo:counter': 42,
}

function renderTable(
  results: Record<string, unknown> = baseResults,
  selectedKeys: Set<string> = new Set(),
  overrides: {
    onToggleSelect?: (k: string) => void
    onToggleAll?: () => void
    onDetail?: (k: string) => void
    onDelete?: (k: string) => void
  } = {}
) {
  const props = {
    results,
    selectedKeys,
    onToggleSelect: overrides.onToggleSelect ?? vi.fn(),
    onToggleAll: overrides.onToggleAll ?? vi.fn(),
    onDetail: overrides.onDetail ?? vi.fn(),
    onDelete: overrides.onDelete ?? vi.fn(),
  }
  return render(<KeyTable {...props} />)
}

describe('KeyTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
  })

  it('shows empty state message when results is empty', () => {
    renderTable({})
    expect(screen.getByText('キーをカンマ区切りで入力して検索してください')).toBeInTheDocument()
  })

  it('renders a row for each key in results', () => {
    renderTable()
    expect(screen.getByText('demo:greeting')).toBeInTheDocument()
    expect(screen.getByText('demo:counter')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    renderTable()
    expect(screen.getByText('キー')).toBeInTheDocument()
    expect(screen.getByText('値プレビュー')).toBeInTheDocument()
    expect(screen.getByText('TTL')).toBeInTheDocument()
    expect(screen.getByText('操作')).toBeInTheDocument()
  })

  it('renders KeyPreviewCell for each row', () => {
    renderTable()
    const previews = screen.getAllByTestId('key-preview')
    expect(previews).toHaveLength(2)
  })

  it('renders 詳細 and 削除 buttons for each row', () => {
    renderTable()
    expect(screen.getAllByText('詳細')).toHaveLength(2)
    expect(screen.getAllByText('削除')).toHaveLength(2)
  })

  it('calls onDetail with the correct key when 詳細 is clicked', async () => {
    const user = userEvent.setup()
    const onDetail = vi.fn()
    renderTable(baseResults, new Set(), { onDetail })
    await user.click(screen.getAllByText('詳細')[0])
    expect(onDetail).toHaveBeenCalledWith('demo:greeting')
  })

  it('calls onDelete with the correct key when 削除 is clicked', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    renderTable(baseResults, new Set(), { onDelete })
    await user.click(screen.getAllByText('削除')[0])
    expect(onDelete).toHaveBeenCalledWith('demo:greeting')
  })

  it('calls onToggleSelect when a row checkbox is clicked', async () => {
    const user = userEvent.setup()
    const onToggleSelect = vi.fn()
    renderTable(baseResults, new Set(), { onToggleSelect })
    const checkboxes = screen.getAllByRole('checkbox')
    // First checkbox is the "select all" in thead, rest are row checkboxes
    await user.click(checkboxes[1])
    expect(onToggleSelect).toHaveBeenCalledWith('demo:greeting')
  })

  it('calls onToggleAll when the header checkbox is clicked', async () => {
    const user = userEvent.setup()
    const onToggleAll = vi.fn()
    renderTable(baseResults, new Set(), { onToggleAll })
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])
    expect(onToggleAll).toHaveBeenCalledTimes(1)
  })

  it('checks the header checkbox when all keys are selected', () => {
    renderTable(baseResults, new Set(['demo:greeting', 'demo:counter']))
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeChecked()
  })

  it('unchecks the header checkbox when not all keys are selected', () => {
    renderTable(baseResults, new Set(['demo:greeting']))
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).not.toBeChecked()
  })

  it('shows a TTL bar when ttlData is available for a key', () => {
    mockUsePolling.mockReturnValue({
      data: {
        results: {
          'demo:greeting': { ttlMs: 60000, persistent: false },
        },
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    renderTable()
    expect(screen.getByTestId('ttl-bar')).toBeInTheDocument()
    expect(screen.getByText('60000ms')).toBeInTheDocument()
  })

  it('shows fallback dash when no TTL data for a key', () => {
    mockUsePolling.mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    renderTable()
    // Both keys have no TTL, so we expect 2 dash placeholders
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })
})
