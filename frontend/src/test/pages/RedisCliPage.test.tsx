import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RedisCliPage } from '../../pages/RedisCliPage'

// Mock the RedisCli component to avoid deep rendering
vi.mock('../../components/cli/RedisCli', () => ({
  RedisCli: () => <div data-testid="redis-cli" />,
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <RedisCliPage />
    </MemoryRouter>
  )
}

describe('RedisCliPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page heading "Redis CLI"', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Redis CLI' })).toBeInTheDocument()
  })

  it('renders description text', () => {
    renderPage()
    expect(
      screen.getByText('ブラウザ内から Redis コマンドを実行できます（ホワイトリスト制限あり）')
    ).toBeInTheDocument()
  })

  it('renders the RedisCli component', () => {
    renderPage()
    expect(screen.getByTestId('redis-cli')).toBeInTheDocument()
  })

  it('renders command reference section heading', () => {
    renderPage()
    expect(screen.getByText('使用可能コマンド')).toBeInTheDocument()
  })

  it('shows GET <key> command in the reference list', () => {
    renderPage()
    expect(screen.getByText('GET <key>')).toBeInTheDocument()
  })

  it('shows SET <key> <value> command in the reference list', () => {
    renderPage()
    expect(screen.getByText('SET <key> <value>')).toBeInTheDocument()
  })

  it('shows INFO command in the reference list', () => {
    renderPage()
    expect(screen.getByText('INFO')).toBeInTheDocument()
  })

  it('shows HGETALL <key> command in the reference list', () => {
    renderPage()
    expect(screen.getByText('HGETALL <key>')).toBeInTheDocument()
  })

  it('shows SLOWLOG GET command in the reference list', () => {
    renderPage()
    expect(screen.getByText('SLOWLOG GET')).toBeInTheDocument()
  })

  it('renders all 15 command entries', () => {
    renderPage()
    const commandTexts = [
      'GET <key>',
      'SET <key> <value>',
      'SCAN 0',
      'TTL <key>',
      'PTTL <key>',
      'TYPE <key>',
      'STRLEN <key>',
      'LLEN <key>',
      'HGETALL <key>',
      'SMEMBERS <key>',
      'ZRANGE <key> 0 -1',
      'ZCARD <key>',
      'INFO',
      'MEMORY USAGE <key>',
      'SLOWLOG GET',
    ]
    for (const cmd of commandTexts) {
      expect(screen.getByText(cmd)).toBeInTheDocument()
    }
  })

  it('shows Tab keyboard hint', () => {
    renderPage()
    expect(screen.getByText('Tab: コマンド補完')).toBeInTheDocument()
  })

  it('shows arrow key keyboard hint for command history', () => {
    renderPage()
    expect(screen.getByText('↑/↓: コマンド履歴')).toBeInTheDocument()
  })

  it('shows Enter keyboard hint', () => {
    renderPage()
    expect(screen.getByText('Enter: 実行')).toBeInTheDocument()
  })

  it('shows a description for GET <key>', () => {
    renderPage()
    expect(screen.getByText('String 値を取得')).toBeInTheDocument()
  })

  it('shows a description for HGETALL <key>', () => {
    renderPage()
    expect(screen.getByText('ハッシュ全取得')).toBeInTheDocument()
  })
})
