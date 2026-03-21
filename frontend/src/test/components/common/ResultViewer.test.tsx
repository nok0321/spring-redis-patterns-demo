import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultViewer } from '../../../components/common/ResultViewer'

describe('ResultViewer', () => {
  it('shows loading spinner when isLoading is true', () => {
    render(<ResultViewer data={null} isLoading={true} />)
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
  })

  it('shows error message when error is provided', () => {
    render(<ResultViewer data={null} error="Something went wrong" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows empty state when data is null', () => {
    render(<ResultViewer data={null} />)
    expect(screen.getByText('データなし')).toBeInTheDocument()
  })

  it('shows empty state when data is undefined', () => {
    render(<ResultViewer data={undefined} />)
    expect(screen.getByText('データなし')).toBeInTheDocument()
  })

  it('renders JSON when data is provided', () => {
    const data = { key: 'value', count: 42 }
    render(<ResultViewer data={data} />)
    expect(screen.getByText(/"key"/)).toBeInTheDocument()
    expect(screen.getByText(/"value"/)).toBeInTheDocument()
  })
})
