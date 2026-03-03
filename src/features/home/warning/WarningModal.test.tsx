// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import WarningModal from './WarningModal'

describe('WarningModal', () => {
  it('triggers confirm and leave callbacks with accessible alertdialog semantics', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'I am over 18' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave Now' }))

    expect(screen.getByRole('alertdialog', { name: '[ Warning ]' })).toBeInTheDocument()
    expect(screen.getByText(/You have to be over 18 to view the contents\./)).toBeInTheDocument()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
