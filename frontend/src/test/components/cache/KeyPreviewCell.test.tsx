import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyPreviewCell } from '../../../components/cache/KeyPreviewCell'

describe('KeyPreviewCell', () => {
  it('renders a string value as-is when under 50 chars', () => {
    render(<KeyPreviewCell value="hello world" />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('truncates a string value longer than 50 chars with ellipsis', () => {
    const longStr = 'a'.repeat(60)
    render(<KeyPreviewCell value={longStr} />)
    expect(screen.getByText('a'.repeat(50) + '...')).toBeInTheDocument()
  })

  it('renders a number value via JSON.stringify', () => {
    render(<KeyPreviewCell value={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders a boolean true via JSON.stringify', () => {
    render(<KeyPreviewCell value={true} />)
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('renders a boolean false via JSON.stringify', () => {
    render(<KeyPreviewCell value={false} />)
    expect(screen.getByText('false')).toBeInTheDocument()
  })

  it('renders null as "null"', () => {
    render(<KeyPreviewCell value={null} />)
    expect(screen.getByText('null')).toBeInTheDocument()
  })

  it('renders an object as JSON string', () => {
    render(<KeyPreviewCell value={{ id: 1, name: 'test' }} />)
    expect(screen.getByText('{"id":1,"name":"test"}')).toBeInTheDocument()
  })

  it('truncates a long JSON object with ellipsis', () => {
    const obj = { key: 'a'.repeat(60) }
    const fullStr = JSON.stringify(obj)
    render(<KeyPreviewCell value={obj} />)
    expect(screen.getByText(fullStr.slice(0, 50) + '...')).toBeInTheDocument()
  })

  it('renders exactly 50-char string without truncation', () => {
    const exact50 = 'b'.repeat(50)
    render(<KeyPreviewCell value={exact50} />)
    expect(screen.getByText(exact50)).toBeInTheDocument()
  })

  it('renders the value inside a code element', () => {
    const { container } = render(<KeyPreviewCell value="test" />)
    expect(container.querySelector('code')).toBeInTheDocument()
  })
})
