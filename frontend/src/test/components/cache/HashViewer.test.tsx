import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HashViewer } from '../../../components/cache/HashViewer'

describe('HashViewer', () => {
  it('フィールド数を表示する', () => {
    render(<HashViewer value={{ name: 'Alice', age: 30 }} />)
    expect(screen.getByText('2 フィールド')).toBeInTheDocument()
  })

  it('フィールド名と値のペアを表示する', () => {
    render(<HashViewer value={{ username: 'bob', role: 'admin' }} />)
    expect(screen.getByText('username')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('role')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('数値の値を文字列として表示する', () => {
    render(<HashViewer value={{ count: 42 }} />)
    expect(screen.getByText('count')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('オブジェクト値をJSON文字列として表示する', () => {
    render(<HashViewer value={{ meta: { active: true } }} />)
    expect(screen.getByText('meta')).toBeInTheDocument()
    expect(screen.getByText('{"active":true}')).toBeInTheDocument()
  })

  it('空オブジェクトの場合は0フィールドを表示する', () => {
    render(<HashViewer value={{}} />)
    expect(screen.getByText('0 フィールド')).toBeInTheDocument()
  })

  it('空オブジェクトの場合はテーブルヘッダーのみ表示する', () => {
    render(<HashViewer value={{}} />)
    expect(screen.getByText('フィールド')).toBeInTheDocument()
    expect(screen.getByText('値')).toBeInTheDocument()
  })

  it('複数フィールドがすべて表示される', () => {
    const value = { a: '1', b: '2', c: '3' }
    render(<HashViewer value={value} />)
    expect(screen.getByText('3 フィールド')).toBeInTheDocument()
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText('c')).toBeInTheDocument()
  })
})
