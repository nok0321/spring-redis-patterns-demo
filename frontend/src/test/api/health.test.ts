import { describe, it, expect } from 'vitest'
import { healthApi } from '../../api/health'

describe('healthApi', () => {
  it('get returns health status', async () => {
    const result = await healthApi.get()
    expect(result.status).toBe('UP')
    expect(result.redis).toBeDefined()
  })
})
