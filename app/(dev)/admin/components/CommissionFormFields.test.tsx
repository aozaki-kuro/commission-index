// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommissionHiddenSwitch } from './CommissionFormFields'

describe('CommissionHiddenSwitch', () => {
  it('triggers onChange when toggled', () => {
    const onChange = vi.fn()

    render(<CommissionHiddenSwitch isHidden={false} onChange={onChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Hide commission from public list' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
