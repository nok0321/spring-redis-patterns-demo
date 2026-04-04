import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ZSetViewer } from '../../../components/cache/ZSetViewer'

describe('ZSetViewer', () => {
  it('メンバー数とスコア降順ラベルを表示する', () => {
    render(<ZSetViewer value={[{ score: 1.0, value: 'member1' }]} />)
    expect(screen.getByText('1 メンバー（スコア降順）')).toBeInTheDocument()
  })

  it('オブジェクトエントリをJSON文字列として表示する', () => {
    const entries = [
      { score: 100, value: 'gold' },
      { score: 50, value: 'silver' },
    ]
    render(<ZSetViewer value={entries} />)
    expect(screen.getByText('{"score":100,"value":"gold"}')).toBeInTheDocument()
    expect(screen.getByText('{"score":50,"value":"silver"}')).toBeInTheDocument()
  })

  it('ランク番号が1始まりで表示される', () => {
    const entries = [{ score: 5, value: 'a' }, { score: 3, value: 'b' }]
    render(<ZSetViewer value={entries} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('文字列メンバーをそのまま表示する', () => {
    render(<ZSetViewer value={['member-one', 'member-two']} />)
    expect(screen.getByText('member-one')).toBeInTheDocument()
    expect(screen.getByText('member-two')).toBeInTheDocument()
  })

  it('空配列の場合は0メンバーを表示する', () => {
    render(<ZSetViewer value={[]} />)
    expect(screen.getByText('0 メンバー（スコア降順）')).toBeInTheDocument()
  })

  it('空配列の場合はエントリが表示されない', () => {
    const { container } = render(<ZSetViewer value={[]} />)
    const rows = container.querySelectorAll('.flex.gap-3')
    expect(rows).toHaveLength(0)
  })

  it('nullメンバーを文字列として表示する', () => {
    render(<ZSetViewer value={[null]} />)
    expect(screen.getByText('null')).toBeInTheDocument()
  })
})
