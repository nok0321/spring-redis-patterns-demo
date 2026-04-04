import { describe, it, expect } from 'vitest'
import { transactionApi } from '../../api/transaction'

describe('transactionApi', () => {
  it('runSaga returns saga result with steps', async () => {
    const result = await transactionApi.runSaga()
    expect(Array.isArray(result.steps)).toBe(true)
    expect(result.steps.length).toBeGreaterThan(0)
    expect(result.overallStatus).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('runSaga returns SUCCESS status', async () => {
    const result = await transactionApi.runSaga()
    expect(result.overallStatus).toBe('SUCCESS')
  })

  it('runSaga steps have required fields', async () => {
    const result = await transactionApi.runSaga()
    const step = result.steps[0]
    expect(step.name).toBeDefined()
    expect(step.status).toBeDefined()
    expect(typeof step.durationMs).toBe('number')
    expect(step.detail).toBeDefined()
  })

  it('runSagaFail returns COMPENSATED status', async () => {
    const result = await transactionApi.runSagaFail()
    expect(result.overallStatus).toBe('COMPENSATED')
  })

  it('runSagaFail returns compensation steps', async () => {
    const result = await transactionApi.runSagaFail()
    expect(Array.isArray(result.compensationSteps)).toBe(true)
    expect(result.compensationSteps!.length).toBeGreaterThan(0)
  })

  it('runSagaFail compensation step has COMPENSATED status', async () => {
    const result = await transactionApi.runSagaFail()
    const compStep = result.compensationSteps![0]
    expect(compStep.status).toBe('COMPENSATED')
  })

  it('runSagaFail has a FAILED step in the steps list', async () => {
    const result = await transactionApi.runSagaFail()
    const failedStep = result.steps.find(s => s.status === 'FAILED')
    expect(failedStep).toBeDefined()
  })

  it('runSaga timestamp is a number', async () => {
    const result = await transactionApi.runSaga()
    expect(typeof result.timestamp).toBe('number')
  })
})
