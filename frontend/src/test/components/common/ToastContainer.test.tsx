import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastContainer } from '../../../components/common/ToastContainer'
import type { ToastItem } from '../../../hooks/useToast'

describe('ToastContainer', () => {
  it('renders nothing when toasts is empty', () => {
    const { container } = render(<ToastContainer toasts={[]} />)
    const toastItems = container.querySelectorAll('[class*="bg-"]')
    expect(toastItems.length).toBe(0)
  })

  it('renders success toast with green background', () => {
    const toasts: ToastItem[] = [{ id: '1', message: 'Success!', variant: 'success' }]
    render(<ToastContainer toasts={toasts} />)
    expect(screen.getByText('Success!')).toBeInTheDocument()
    expect(screen.getByText('Success!').closest('div')).toHaveClass('bg-green-600')
  })

  it('renders error toast with red background', () => {
    const toasts: ToastItem[] = [{ id: '2', message: 'Error!', variant: 'error' }]
    render(<ToastContainer toasts={toasts} />)
    expect(screen.getByText('Error!').closest('div')).toHaveClass('bg-red-600')
  })

  it('renders info toast with blue background', () => {
    const toasts: ToastItem[] = [{ id: '3', message: 'Info', variant: 'info' }]
    render(<ToastContainer toasts={toasts} />)
    expect(screen.getByText('Info').closest('div')).toHaveClass('bg-blue-600')
  })

  it('renders multiple toasts', () => {
    const toasts: ToastItem[] = [
      { id: '1', message: 'First', variant: 'success' },
      { id: '2', message: 'Second', variant: 'error' },
    ]
    render(<ToastContainer toasts={toasts} />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})
