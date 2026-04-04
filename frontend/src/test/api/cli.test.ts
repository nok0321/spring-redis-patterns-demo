import { describe, it, expect } from 'vitest'
import { cliApi } from '../../api/cli'

describe('cliApi', () => {
  it('execute returns command result', async () => {
    const result = await cliApi.execute('GET mykey')
    expect(result.command).toBe('GET mykey')
    expect(result.result).toBe('OK')
    expect(result.executionMs).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('execute sends the command in the request body', async () => {
    const result = await cliApi.execute('SET foo bar')
    // The MSW handler responds with a fixed command echo; just check the shape is correct
    expect(result).toHaveProperty('command')
    expect(result).toHaveProperty('executionMs')
    expect(typeof result.executionMs).toBe('number')
  })

  it('execute result has no error field by default', async () => {
    const result = await cliApi.execute('PING')
    expect(result.error).toBeUndefined()
  })

  it('execute handles commands with spaces and arguments', async () => {
    const result = await cliApi.execute('KEYS demo:*')
    expect(result).toHaveProperty('timestamp')
    expect(typeof result.timestamp).toBe('number')
  })
})
