import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListViewer } from '../../../components/cache/ListViewer'

describe('ListViewer', () => {
  it('要素数を表示する', () => {
    render(<ListViewer value={['a', 'b', 'c']} />)
    expect(screen.getByText('3 要素')).toBeInTheDocument()
  })

  it('各要素をインデックス付きで表示する', () => {
    render(<ListViewer value={['apple', 'banana', 'cherry']} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('apple')).toBeInTheDocument()
    expect(screen.getByText('banana')).toBeInTheDocument()
    expect(screen.getByText('cherry')).toBeInTheDocument()
  })

  it('数値要素を文字列として表示する', () => {
    render(<ListViewer value={[10, 20, 30]} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('オブジェクト要素をJSON文字列として表示する', () => {
    render(<ListViewer value={[{ id: 1, name: 'test' }]} />)
    expect(screen.getByText('{"id":1,"name":"test"}')).toBeInTheDocument()
  })

  it('空配列の場合は0要素を表示する', () => {
    render(<ListViewer value={[]} />)
    expect(screen.getByText('0 要素')).toBeInTheDocument()
  })

  it('空配列の場合は要素が表示されない', () => {
    const { container } = render(<ListViewer value={[]} />)
    const items = container.querySelectorAll('.flex.gap-3')
    expect(items).toHaveLength(0)
  })

  it('インデックスが0始まりで表示される', () => {
    render(<ListViewer value={['first', 'second']} />)
    const indices = screen.getAllByText(/^[0-9]+$/)
    expect(indices[0]).toHaveTextContent('0')
    expect(indices[1]).toHaveTextContent('1')
  })
})
