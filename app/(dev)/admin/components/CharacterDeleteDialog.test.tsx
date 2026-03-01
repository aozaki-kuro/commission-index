// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CharacterDeleteDialog from './CharacterDeleteDialog'

describe('CharacterDeleteDialog', () => {
  it('calls close and confirm handlers', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    render(
      <CharacterDeleteDialog
        isOpen
        characterName="Artoria"
        commissionCount={3}
        isDeletePending={false}
        confirmButtonRef={createRef<HTMLButtonElement>()}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
