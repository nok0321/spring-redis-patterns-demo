import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransferLog } from '../../../components/locks/TransferLog'
import type { TransferResponse } from '../../../types/locks'

const sampleLogs: TransferResponse[] = [
  {
    transferId: 'abcd1234-uuid-here',
    success: true,
    fromKey: 'balance:account:A',
    toKey: 'balance:account:B',
    amount: 1000,
    timestamp: new Date('2024-01-01T12:00:00').getTime(),
  },
  {
    transferId: 'efgh5678-uuid-here',
    success: false,
    fromKey: 'balance:account:B',
    toKey: 'balance:account:C',
    amount: 500,
    timestamp: new Date('2024-01-01T12:01:00').getTime(),
  },
]

describe('TransferLog', () => {
  it('空配列のとき空メッセージを表示する', () => {
    render(<TransferLog logs={[]} />)
    expect(screen.getByText('送金ログはまだありません')).toBeInTheDocument()
  })

  it('ログエントリを表示する', () => {
    render(<TransferLog logs={sampleLogs} />)
    // transferId の先頭8文字
    expect(screen.getByText('abcd1234')).toBeInTheDocument()
    expect(screen.getByText('efgh5678')).toBeInTheDocument()
  })

  it('成功バッジを表示する', () => {
    render(<TransferLog logs={[sampleLogs[0]]} />)
    expect(screen.getByText('成功')).toBeInTheDocument()
  })

  it('失敗バッジを表示する', () => {
    render(<TransferLog logs={[sampleLogs[1]]} />)
    expect(screen.getByText('失敗')).toBeInTheDocument()
  })

  it('金額をフォーマットして表示する', () => {
    render(<TransferLog logs={[sampleLogs[0]]} />)
    // toLocaleString()は環境依存だが 1000 が含まれることを確認
    expect(screen.getByText(/1[,，]?000|1000/)).toBeInTheDocument()
  })

  it('複数エントリを正しく表示する', () => {
    render(<TransferLog logs={sampleLogs} />)
    expect(screen.getByText('成功')).toBeInTheDocument()
    expect(screen.getByText('失敗')).toBeInTheDocument()
  })
})
