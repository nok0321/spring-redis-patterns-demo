import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransferResultBadge } from '../../../components/locks/TransferResultBadge'

describe('TransferResultBadge', () => {
  it('success=true のとき 成功 を表示する', () => {
    render(<TransferResultBadge success={true} />)
    expect(screen.getByText('成功')).toBeInTheDocument()
  })

  it('success=false のとき 失敗 を表示する', () => {
    render(<TransferResultBadge success={false} />)
    expect(screen.getByText('失敗')).toBeInTheDocument()
  })

  it('success=true のとき緑色クラスが適用される', () => {
    render(<TransferResultBadge success={true} />)
    const badge = screen.getByText('成功')
    expect(badge.className).toContain('bg-green-900')
    expect(badge.className).toContain('text-green-300')
  })

  it('success=false のとき赤色クラスが適用される', () => {
    render(<TransferResultBadge success={false} />)
    const badge = screen.getByText('失敗')
    expect(badge.className).toContain('bg-red-900')
    expect(badge.className).toContain('text-red-300')
  })
})
