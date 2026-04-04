import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActiveLocksList } from '../../../components/dashboard/ActiveLocksList'
import type { LockStats } from '../../../types/locks'

describe('ActiveLocksList', () => {
  it('undefined のとき空メッセージを表示する', () => {
    render(<ActiveLocksList locks={undefined} />)
    expect(screen.getByText('アクティブなロックはありません')).toBeInTheDocument()
  })

  it('空オブジェクトのとき空メッセージを表示する', () => {
    render(<ActiveLocksList locks={{}} />)
    expect(screen.getByText('アクティブなロックはありません')).toBeInTheDocument()
  })

  it('ロックキーを表示する', () => {
    const locks: Record<string, LockStats> = {
      'lock:order:123': { attempts: 10, acquisitions: 9, timeouts: 1, releases: 9, operationSuccesses: 9, operationFailures: 0 },
    }
    render(<ActiveLocksList locks={locks} />)
    expect(screen.getByText('lock:order:123')).toBeInTheDocument()
  })

  it('成功率を表示する', () => {
    const locks: Record<string, LockStats> = {
      'lock:order:123': { attempts: 10, acquisitions: 8, timeouts: 2, releases: 8, operationSuccesses: 8, operationFailures: 0 },
    }
    render(<ActiveLocksList locks={locks} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('試行数が0のとき成功率は0%', () => {
    const locks: Record<string, LockStats> = {
      'lock:x': { attempts: 0, acquisitions: 0, timeouts: 0, releases: 0, operationSuccesses: 0, operationFailures: 0 },
    }
    render(<ActiveLocksList locks={locks} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('複数のロックエントリを表示する', () => {
    const locks: Record<string, LockStats> = {
      'lock:a': { attempts: 10, acquisitions: 10, timeouts: 0, releases: 10, operationSuccesses: 10, operationFailures: 0 },
      'lock:b': { attempts: 5, acquisitions: 3, timeouts: 2, releases: 3, operationSuccesses: 3, operationFailures: 0 },
    }
    render(<ActiveLocksList locks={locks} />)
    expect(screen.getByText('lock:a')).toBeInTheDocument()
    expect(screen.getByText('lock:b')).toBeInTheDocument()
  })

  it('ヘッダータイトルを表示する', () => {
    render(<ActiveLocksList locks={{}} />)
    expect(screen.getByText('アクティブロック')).toBeInTheDocument()
  })
})
