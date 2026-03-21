import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PubSubPage } from '../../pages/PubSubPage'

// jsdom does not implement HTMLElement.scrollTo — mock it globally for this suite
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  writable: true,
  value: vi.fn(),
})

// Mock pubsubApi
vi.mock('../../api/pubsub', () => ({
  pubsubApi: {
    publish: vi.fn(),
    createEventSource: vi.fn(),
  },
}))

import { pubsubApi } from '../../api/pubsub'

const mockPublish = vi.mocked(pubsubApi.publish)
const mockCreateEventSource = vi.mocked(pubsubApi.createEventSource)

// Minimal EventSource mock
class MockEventSource {
  static instances: MockEventSource[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private _onopen: (() => void) | null = null

  // Auto-fire onopen when set to simulate immediate connection establishment
  set onopen(handler: (() => void) | null) {
    this._onopen = handler
    if (handler) handler()
  }
  get onopen() {
    return this._onopen
  }

  constructor() {
    MockEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  /** Helper: simulate an incoming SSE message */
  simulateMessage(data: object) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
}

function renderPubSub() {
  return render(
    <MemoryRouter>
      <PubSubPage />
    </MemoryRouter>
  )
}

describe('PubSubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockEventSource.instances = []
    mockCreateEventSource.mockImplementation(() => new MockEventSource() as unknown as EventSource)
    mockPublish.mockResolvedValue({
      topic: 'test',
      message: 'hello',
      subscribers: 1,
      timestamp: Date.now(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders page heading', () => {
    renderPubSub()
    expect(screen.getByText('Pub/Sub メッセージングビジュアライザー')).toBeInTheDocument()
  })

  it('renders Publisher and Subscriber sections', () => {
    renderPubSub()
    // "Publisher" and "Subscriber" appear in both the section heading and the flow diagram
    expect(screen.getAllByText('Publisher').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Subscriber').length).toBeGreaterThanOrEqual(1)
  })

  it('creates an EventSource on mount', () => {
    renderPubSub()
    expect(mockCreateEventSource).toHaveBeenCalledTimes(1)
  })

  it('closes EventSource on unmount', () => {
    const { unmount } = renderPubSub()
    const es = MockEventSource.instances[0]
    unmount()
    expect(es.closed).toBe(true)
  })

  it('shows empty message area initially', () => {
    renderPubSub()
    expect(screen.getByText('まだメッセージはありません')).toBeInTheDocument()
  })

  it('renders received SSE messages in the subscriber list', async () => {
    renderPubSub()
    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage({ topic: 'test', message: 'Hello World', timestamp: 1700000000000 })
    })
    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument()
      expect(screen.getByText('test')).toBeInTheDocument()
    })
  })

  it('shows message count', async () => {
    renderPubSub()
    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage({ topic: 'test', message: 'msg1', timestamp: Date.now() })
      es.simulateMessage({ topic: 'test', message: 'msg2', timestamp: Date.now() })
    })
    await waitFor(() => {
      expect(screen.getByText('2 件')).toBeInTheDocument()
    })
  })

  it('caps messages at 50', async () => {
    renderPubSub()
    const es = MockEventSource.instances[0]
    act(() => {
      for (let i = 0; i < 60; i++) {
        es.simulateMessage({ topic: 'test', message: `msg${i}`, timestamp: Date.now() + i })
      }
    })
    await waitFor(() => {
      // The component slices to last 49 + new one = 50 max
      expect(screen.getByText('50 件')).toBeInTheDocument()
    })
  })

  it('clears messages when クリア is clicked', async () => {
    renderPubSub()
    const es = MockEventSource.instances[0]
    act(() => {
      es.simulateMessage({ topic: 'test', message: 'msg1', timestamp: Date.now() })
    })
    await waitFor(() => expect(screen.getByText('1 件')).toBeInTheDocument())
    fireEvent.click(screen.getByText('クリア'))
    await waitFor(() => {
      expect(screen.getByText('まだメッセージはありません')).toBeInTheDocument()
    })
  })

  it('publishes message when ▶ パブリッシュ is clicked', async () => {
    renderPubSub()
    const messageInput = screen.getByPlaceholderText('送信するメッセージを入力 (Enter で送信)')
    fireEvent.change(messageInput, { target: { value: 'Hello Redis' } })
    fireEvent.click(screen.getByText('▶ パブリッシュ'))
    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith('test', 'Hello Redis')
    })
  })

  it('clears message input after successful publish', async () => {
    renderPubSub()
    const messageInput = screen.getByPlaceholderText('送信するメッセージを入力 (Enter で送信)')
    fireEvent.change(messageInput, { target: { value: 'Hello Redis' } })
    fireEvent.click(screen.getByText('▶ パブリッシュ'))
    await waitFor(() => {
      expect(messageInput).toHaveValue('')
    })
  })

  it('does not publish when message is empty', async () => {
    renderPubSub()
    fireEvent.click(screen.getByText('▶ パブリッシュ'))
    await waitFor(() => {
      expect(mockPublish).not.toHaveBeenCalled()
    })
  })

  it('shows error when publish fails', async () => {
    mockPublish.mockRejectedValue(new Error('接続に失敗しました'))
    renderPubSub()
    const messageInput = screen.getByPlaceholderText('送信するメッセージを入力 (Enter で送信)')
    fireEvent.change(messageInput, { target: { value: 'fail message' } })
    fireEvent.click(screen.getByText('▶ パブリッシュ'))
    await waitFor(() => {
      expect(screen.getByText('接続に失敗しました')).toBeInTheDocument()
    })
  })

  it('allows changing the topic', () => {
    renderPubSub()
    const topicInput = screen.getByPlaceholderText('test')
    fireEvent.change(topicInput, { target: { value: 'my-topic' } })
    expect(topicInput).toHaveValue('my-topic')
  })

  it('publishes to the specified topic', async () => {
    renderPubSub()
    const topicInput = screen.getByPlaceholderText('test')
    fireEvent.change(topicInput, { target: { value: 'my-topic' } })
    const messageInput = screen.getByPlaceholderText('送信するメッセージを入力 (Enter で送信)')
    fireEvent.change(messageInput, { target: { value: 'hi' } })
    fireEvent.click(screen.getByText('▶ パブリッシュ'))
    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith('my-topic', 'hi')
    })
  })

  it('publishes when Enter is pressed in textarea', async () => {
    renderPubSub()
    const messageInput = screen.getByPlaceholderText('送信するメッセージを入力 (Enter で送信)')
    fireEvent.change(messageInput, { target: { value: 'enter test' } })
    fireEvent.keyDown(messageInput, { key: 'Enter', shiftKey: false })
    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith('test', 'enter test')
    })
  })

  it('does not publish when Shift+Enter is pressed', async () => {
    renderPubSub()
    const messageInput = screen.getByPlaceholderText('送信するメッセージを入力 (Enter で送信)')
    fireEvent.change(messageInput, { target: { value: 'shift enter' } })
    fireEvent.keyDown(messageInput, { key: 'Enter', shiftKey: true })
    await waitFor(() => {
      expect(mockPublish).not.toHaveBeenCalled()
    })
  })

  it('shows message flow diagram', () => {
    renderPubSub()
    expect(screen.getByText('メッセージフロー')).toBeInTheDocument()
    expect(screen.getByText('Redis')).toBeInTheDocument()
  })

  it('shows SSE status text', () => {
    renderPubSub()
    expect(screen.getByText('SSE (Server-Sent Events) でリアルタイム受信中')).toBeInTheDocument()
  })

  it('ignores malformed SSE data without crashing', async () => {
    renderPubSub()
    const es = MockEventSource.instances[0]
    act(() => {
      // Simulate bad JSON message
      es.onmessage?.(new MessageEvent('message', { data: 'not-json' }))
    })
    // Should not throw; page should still be visible
    expect(screen.getByText('Pub/Sub メッセージングビジュアライザー')).toBeInTheDocument()
    expect(screen.getByText('まだメッセージはありません')).toBeInTheDocument()
  })
})
