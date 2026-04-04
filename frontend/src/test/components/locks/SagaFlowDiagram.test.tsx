import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SagaFlowDiagram } from '../../../components/locks/SagaFlowDiagram'
import type { SagaStep } from '../../../types/transaction'

const successSteps: SagaStep[] = [
  { name: '残高確認', status: 'SUCCESS', durationMs: 10, detail: '残高確認OK' },
  { name: '引き落とし', status: 'SUCCESS', durationMs: 20, detail: '引き落とし完了' },
]

const failedStep: SagaStep = {
  name: '送金', status: 'FAILED', durationMs: 5, detail: '送金失敗'
}

const compensationSteps: SagaStep[] = [
  { name: '引き落とし補償', status: 'COMPENSATED', durationMs: 15, detail: '補償完了' },
]

describe('SagaFlowDiagram', () => {
  it('ステップ名を表示する', () => {
    render(<SagaFlowDiagram steps={successSteps} />)
    expect(screen.getByText('残高確認')).toBeInTheDocument()
    expect(screen.getByText('引き落とし')).toBeInTheDocument()
  })

  it('ステップの詳細を表示する', () => {
    render(<SagaFlowDiagram steps={successSteps} />)
    expect(screen.getByText('残高確認OK')).toBeInTheDocument()
    expect(screen.getByText('引き落とし完了')).toBeInTheDocument()
  })

  it('ステップの所要時間を表示する', () => {
    render(<SagaFlowDiagram steps={successSteps} />)
    expect(screen.getByText('10ms')).toBeInTheDocument()
    expect(screen.getByText('20ms')).toBeInTheDocument()
  })

  it('FAILED ステップを表示する', () => {
    render(<SagaFlowDiagram steps={[failedStep]} />)
    expect(screen.getByText('送金')).toBeInTheDocument()
    expect(screen.getByText('送金失敗')).toBeInTheDocument()
  })

  it('補償ステップがないとき補償セクションは表示しない', () => {
    render(<SagaFlowDiagram steps={successSteps} />)
    expect(screen.queryByText('補償処理 (Rollback)')).not.toBeInTheDocument()
  })

  it('補償ステップがあるとき補償セクションを表示する', () => {
    render(<SagaFlowDiagram steps={successSteps} compensationSteps={compensationSteps} />)
    expect(screen.getByText('補償処理 (Rollback)')).toBeInTheDocument()
  })

  it('補償ステップの名前を表示する', () => {
    render(<SagaFlowDiagram steps={successSteps} compensationSteps={compensationSteps} />)
    expect(screen.getByText('引き落とし補償')).toBeInTheDocument()
  })

  it('空配列でクラッシュしない', () => {
    render(<SagaFlowDiagram steps={[]} />)
    // Renders without error
  })
})
