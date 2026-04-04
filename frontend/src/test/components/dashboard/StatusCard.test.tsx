import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusCard } from '../../../components/dashboard/StatusCard'

describe('StatusCard', () => {
  it('ラベルと値を表示する', () => {
    render(<StatusCard label="キャッシュヒット率" value="95%" />)
    expect(screen.getByText('キャッシュヒット率')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
  })

  it('数値の値を表示する', () => {
    render(<StatusCard label="操作数" value={1234} />)
    expect(screen.getByText('1234')).toBeInTheDocument()
  })

  it('デフォルトステータスは neutral', () => {
    render(<StatusCard label="label" value="val" />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('border-gray-500')
  })

  it('ok ステータスの色クラスが適用される', () => {
    render(<StatusCard label="label" value="val" status="ok" />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('border-green-500')
  })

  it('warn ステータスの色クラスが適用される', () => {
    render(<StatusCard label="label" value="val" status="warn" />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('border-yellow-500')
  })

  it('error ステータスの色クラスが適用される', () => {
    render(<StatusCard label="label" value="val" status="error" />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('border-red-500')
  })

  it('onClick が呼ばれる', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<StatusCard label="label" value="val" onClick={onClick} />)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('icon が表示される', () => {
    render(<StatusCard label="label" value="val" icon={<span data-testid="test-icon">icon</span>} />)
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('ステータスドットのラベルが表示される', () => {
    render(<StatusCard label="label" value="val" status="ok" />)
    expect(screen.getByLabelText('正常')).toBeInTheDocument()
  })
})
