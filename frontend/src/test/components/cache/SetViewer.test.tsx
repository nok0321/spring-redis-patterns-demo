import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SetViewer } from '../../../components/cache/SetViewer'

describe('SetViewer', () => {
  it('メンバー数を表示する', () => {
    render(<SetViewer value={['x', 'y', 'z']} />)
    expect(screen.getByText('3 メンバー')).toBeInTheDocument()
  })

  it('各メンバーをタグ形式で表示する', () => {
    render(<SetViewer value={['alpha', 'beta', 'gamma']} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByText('gamma')).toBeInTheDocument()
  })

  it('数値メンバーを文字列として表示する', () => {
    render(<SetViewer value={[100, 200]} />)
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('オブジェクトメンバーをJSON文字列として表示する', () => {
    render(<SetViewer value={[{ key: 'val' }]} />)
    expect(screen.getByText('{"key":"val"}')).toBeInTheDocument()
  })

  it('空配列の場合は0メンバーを表示する', () => {
    render(<SetViewer value={[]} />)
    expect(screen.getByText('0 メンバー')).toBeInTheDocument()
  })

  it('空配列の場合はタグが表示されない', () => {
    const { container } = render(<SetViewer value={[]} />)
    const tags = container.querySelectorAll('span.rounded-full')
    expect(tags).toHaveLength(0)
  })

  it('1メンバーのセットを正しく表示する', () => {
    render(<SetViewer value={['only-member']} />)
    expect(screen.getByText('1 メンバー')).toBeInTheDocument()
    expect(screen.getByText('only-member')).toBeInTheDocument()
  })
})
