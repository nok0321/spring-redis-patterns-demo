import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyInfoPanel } from '../../../components/cache/KeyInfoPanel'

describe('KeyInfoPanel', () => {
  const baseDate = new Date('2024-06-15T10:30:00')

  it('renders the section heading 情報', () => {
    render(<KeyInfoPanel keyName="demo:greeting" found={true} fetchedAt={baseDate} />)
    expect(screen.getByText('情報')).toBeInTheDocument()
  })

  it('renders the key name', () => {
    render(<KeyInfoPanel keyName="demo:greeting" found={true} fetchedAt={baseDate} />)
    expect(screen.getByText('demo:greeting')).toBeInTheDocument()
  })

  it('renders the fetchedAt date formatted as YYYY-MM-DD HH:mm:ss', () => {
    render(<KeyInfoPanel keyName="demo:greeting" found={true} fetchedAt={baseDate} />)
    expect(screen.getByText('2024-06-15 10:30:00')).toBeInTheDocument()
  })

  it('shows "true" badge when found is true', () => {
    render(<KeyInfoPanel keyName="my:key" found={true} fetchedAt={baseDate} />)
    const badge = screen.getByText('true')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('green')
  })

  it('shows "false" badge when found is false', () => {
    render(<KeyInfoPanel keyName="missing:key" found={false} fetchedAt={baseDate} />)
    const badge = screen.getByText('false')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('red')
  })

  it('renders the dt labels キー, 取得時刻, found', () => {
    render(<KeyInfoPanel keyName="x" found={true} fetchedAt={baseDate} />)
    expect(screen.getByText('キー')).toBeInTheDocument()
    expect(screen.getByText('取得時刻')).toBeInTheDocument()
    expect(screen.getByText('found')).toBeInTheDocument()
  })

  it('handles long key names without breaking', () => {
    const longKey = 'a'.repeat(100)
    render(<KeyInfoPanel keyName={longKey} found={false} fetchedAt={baseDate} />)
    expect(screen.getByText(longKey)).toBeInTheDocument()
  })
})
