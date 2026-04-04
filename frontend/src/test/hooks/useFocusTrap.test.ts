import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createElement } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// Helper component that uses the hook and renders a container with focusable elements
function TrapFixture({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose?: () => void
}) {
  const containerRef = useFocusTrap(isOpen, onClose)
  return createElement(
    'div',
    { ref: containerRef, 'data-testid': 'trap-container' },
    createElement('button', { 'data-testid': 'btn-first' }, 'First'),
    createElement('button', { 'data-testid': 'btn-last' }, 'Last'),
  )
}

describe('useFocusTrap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(createElement(TrapFixture, { isOpen: true, onClose }))

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose for Escape when isOpen is false', () => {
    const onClose = vi.fn()
    render(createElement(TrapFixture, { isOpen: false, onClose }))

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('focuses the first focusable element when opened', () => {
    render(createElement(TrapFixture, { isOpen: true }))
    expect(document.activeElement).toBe(screen.getByTestId('btn-first'))
  })

  it('does not change focus when isOpen is false', () => {
    // Focus something outside
    const outsideBtn = document.createElement('button')
    document.body.appendChild(outsideBtn)
    outsideBtn.focus()

    render(createElement(TrapFixture, { isOpen: false }))

    // Focus should still be on the outside button
    expect(document.activeElement).toBe(outsideBtn)

    document.body.removeChild(outsideBtn)
  })

  it('restores focus to previously focused element when closed', () => {
    const outsideBtn = document.createElement('button')
    document.body.appendChild(outsideBtn)
    outsideBtn.focus()
    expect(document.activeElement).toBe(outsideBtn)

    const { rerender } = render(createElement(TrapFixture, { isOpen: true }))

    // Focus should now be inside the trap
    expect(document.activeElement).toBe(screen.getByTestId('btn-first'))

    act(() => {
      rerender(createElement(TrapFixture, { isOpen: false }))
    })

    // Focus should be restored to the outside button
    expect(document.activeElement).toBe(outsideBtn)

    document.body.removeChild(outsideBtn)
  })

  it('does not throw when onClose is not provided and Escape is pressed', () => {
    render(createElement(TrapFixture, { isOpen: true }))

    expect(() => {
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' })
      })
    }).not.toThrow()
  })

  it('returns a ref object', () => {
    // The hook is verified to work by the container being in the DOM
    render(createElement(TrapFixture, { isOpen: true }))
    expect(screen.getByTestId('trap-container')).toBeInTheDocument()
  })
})
