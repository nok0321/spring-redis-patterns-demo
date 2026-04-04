import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RedisCli } from '../../../components/cli/RedisCli'

vi.mock('../../../api/cli', () => ({
  cliApi: {
    execute: vi.fn(),
  },
}))

import { cliApi } from '../../../api/cli'

const mockExecute = vi.mocked(cliApi.execute)

// jsdom does not implement scrollTo; mock it to avoid TypeError
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn()
})

describe('RedisCli', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初期メッセージとコマンド入力欄が表示される', () => {
    render(<RedisCli />)
    expect(screen.getByText('# Redis CLI (ホワイトリスト制限あり)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/コマンドを入力/)).toBeInTheDocument()
  })

  it('redis> プロンプトラベルが表示される', () => {
    render(<RedisCli />)
    // The static prompt next to the input field
    expect(screen.getByText('redis>')).toBeInTheDocument()
  })

  it('コマンドを入力してEnterで実行し、結果を表示する', async () => {
    const user = userEvent.setup()
    mockExecute.mockResolvedValue({
      command: 'GET mykey',
      result: 'myvalue',
      executionMs: 5,
      timestamp: Date.now(),
    })

    render(<RedisCli />)

    const input = screen.getByPlaceholderText(/コマンドを入力/)
    await user.type(input, 'GET mykey')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('myvalue')).toBeInTheDocument()
    })
    expect(mockExecute).toHaveBeenCalledWith('GET mykey')
  })

  it('入力したコマンドがターミナルに「redis> コマンド」形式で表示される', async () => {
    const user = userEvent.setup()
    mockExecute.mockResolvedValue({
      command: 'KEYS star',
      result: 'key1',
      executionMs: 3,
      timestamp: Date.now(),
    })

    render(<RedisCli />)

    const input = screen.getByPlaceholderText(/コマンドを入力/)
    await user.type(input, 'KEYS star')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('redis> KEYS star')).toBeInTheDocument()
    })
  })

  it('APIがerrorを返した場合はエラーメッセージを表示する', async () => {
    const user = userEvent.setup()
    mockExecute.mockResolvedValue({
      command: 'FLUSHALL',
      error: 'ERR command not allowed',
      executionMs: 1,
      timestamp: Date.now(),
    })

    render(<RedisCli />)

    const input = screen.getByPlaceholderText(/コマンドを入力/)
    await user.type(input, 'FLUSHALL')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('(error) ERR command not allowed')).toBeInTheDocument()
    })
  })

  it('ネットワークエラー発生時はnetwork errorメッセージを表示する', async () => {
    const user = userEvent.setup()
    mockExecute.mockRejectedValue(new Error('Network failure'))

    render(<RedisCli />)

    const input = screen.getByPlaceholderText(/コマンドを入力/)
    await user.type(input, 'GET key')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('(network error) Network failure')).toBeInTheDocument()
    })
  })

  it('resultがundefinedの場合は(nil)を表示する', async () => {
    const user = userEvent.setup()
    mockExecute.mockResolvedValue({
      command: 'GET nonexistent',
      result: undefined,
      executionMs: 2,
      timestamp: Date.now(),
    })

    render(<RedisCli />)

    const input = screen.getByPlaceholderText(/コマンドを入力/)
    await user.type(input, 'GET nonexistent')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('(nil)')).toBeInTheDocument()
    })
  })

  it('実行時間（ms）が表示される', async () => {
    const user = userEvent.setup()
    mockExecute.mockResolvedValue({
      command: 'TTL mykey',
      result: '3600',
      executionMs: 7,
      timestamp: Date.now(),
    })

    render(<RedisCli />)

    const input = screen.getByPlaceholderText(/コマンドを入力/)
    await user.type(input, 'TTL mykey')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/↳ 7ms/)).toBeInTheDocument()
    })
  })

  it('空コマンドでEnterを押してもAPIは呼ばれない', async () => {
    const user = userEvent.setup()

    render(<RedisCli />)

    await user.keyboard('{Enter}')

    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('Tabキーでコマンドが補完される', async () => {
    const user = userEvent.setup()

    render(<RedisCli />)

    const input = screen.getByPlaceholderText(/コマンドを入力/)
    await user.type(input, 'GE')
    await user.keyboard('{Tab}')

    expect(input).toHaveValue('GET ')
  })
})
