// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Popover, PopoverTrigger } from '#components/ui/popover'
import CommissionSearchHelpPopover from './CommissionSearchHelpPopover'

const PopoverHarness = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Search help">
          Search help
        </button>
      </PopoverTrigger>
      <CommissionSearchHelpPopover onOpenChange={setIsOpen} />
    </Popover>
  )
}

describe('CommissionSearchHelpPopover', () => {
  it('opens and closes with help trigger interactions', async () => {
    render(<PopoverHarness />)

    const trigger = screen.getByRole('button', { name: 'Search help' })
    fireEvent.click(trigger)

    expect(await screen.findByRole('heading', { name: 'Search Help' })).toBeInTheDocument()
    expect(screen.getByText('blue hair | silver !sketch')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Search Help' })).toBeInTheDocument()
    })

    fireEvent.pointerDown(document.body)

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Search Help' })).not.toBeInTheDocument()
    })
  })
})
