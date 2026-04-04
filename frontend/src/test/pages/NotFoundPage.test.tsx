import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotFoundPage } from '../../pages/NotFoundPage'

describe('NotFoundPage', () => {
  it('renders 404 message', () => {
    render(<NotFoundPage />)
    expect(screen.getByText(/404/)).toBeInTheDocument()
    expect(screen.getByText(/ページが見つかりません/)).toBeInTheDocument()
  })

  it('renders home link', () => {
    render(<NotFoundPage />)
    const link = screen.getByRole('link', { name: /ホームに戻る/ })
    expect(link).toHaveAttribute('href', '/')
  })
})
