// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import WarningModal from './WarningModal'

describe('WarningModal', () => {
  it('focuses the confirm button when opened', async () => {
    const onConfirm = vi.fn()
    const onLeave = vi.fn()
    const confirmButtonRef = createRef<HTMLButtonElement>()

    render(
      <WarningModal
        isOpen
        confirmButtonRef={confirmButtonRef}
        onConfirm={onConfirm}
        onLeave={onLeave}
      />,
    )

    const confirmButton = screen.getByRole('button', { name: 'I am over 18' })

    await waitFor(() => {
      expect(confirmButton).toHaveFocus()
    })
  })

  it('does not close from outside interactions and triggers callbacks on button click', () => {
    const onConfirm = vi.fn()
    const onLeave = vi.fn()
    const confirmButtonRef = createRef<HTMLButtonElement>()

    render(
      <WarningModal
        isOpen
        confirmButtonRef={confirmButtonRef}
        onConfirm={onConfirm}
        onLeave={onLeave}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.pointerDown(document.body)
    expect(screen.getByText('[ Warning ]')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'I am over 18' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave Now' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
