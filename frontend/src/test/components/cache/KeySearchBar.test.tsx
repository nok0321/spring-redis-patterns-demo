import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeySearchBar } from '../../../components/cache/KeySearchBar'

describe('KeySearchBar', () => {
  const onPatternChange = vi.fn()
  const onSearch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input with the current pattern value', () => {
    render(
      <KeySearchBar
        pattern="demo:*"
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={false}
      />
    )
    expect(screen.getByRole('textbox')).toHaveValue('demo:*')
  })

  it('renders the 検索 button when not searching', () => {
    render(
      <KeySearchBar
        pattern=""
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={false}
      />
    )
    expect(screen.getByText('検索')).toBeInTheDocument()
  })

  it('renders 検索中... and disables button when isSearching is true', () => {
    render(
      <KeySearchBar
        pattern=""
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={true}
      />
    )
    expect(screen.getByText('検索中...')).toBeInTheDocument()
    expect(screen.getByText('検索中...')).toBeDisabled()
  })

  it('calls onPatternChange when typing in the input', async () => {
    const user = userEvent.setup()
    render(
      <KeySearchBar
        pattern=""
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={false}
      />
    )
    await user.type(screen.getByRole('textbox'), 'a')
    expect(onPatternChange).toHaveBeenCalledWith('a')
  })

  it('calls onSearch when the 検索 button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <KeySearchBar
        pattern="user:*"
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={false}
      />
    )
    await user.click(screen.getByText('検索'))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('calls onSearch when Enter key is pressed in the input', async () => {
    const user = userEvent.setup()
    render(
      <KeySearchBar
        pattern="session:*"
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={false}
      />
    )
    await user.type(screen.getByRole('textbox'), '{Enter}')
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('does not call onSearch when other keys are pressed', async () => {
    const user = userEvent.setup()
    render(
      <KeySearchBar
        pattern=""
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={false}
      />
    )
    await user.type(screen.getByRole('textbox'), '{Tab}')
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('does not call onSearch when button is clicked while searching', async () => {
    const user = userEvent.setup()
    render(
      <KeySearchBar
        pattern=""
        onPatternChange={onPatternChange}
        onSearch={onSearch}
        isSearching={true}
      />
    )
    await user.click(screen.getByText('検索中...'))
    expect(onSearch).not.toHaveBeenCalled()
  })
})
