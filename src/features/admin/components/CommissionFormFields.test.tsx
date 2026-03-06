// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommissionCharacterField } from './CommissionFormFields'

describe('CommissionCharacterField', () => {
  it('updates the selected character when choosing an option', () => {
    const handleChange = vi.fn()

    render(
      <CommissionCharacterField
        options={[
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]}
        selectedCharacterId={null}
        onChange={handleChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Character'), {
      target: { value: '1' },
    })

    expect(handleChange).toHaveBeenCalledWith(1)
  })
})
