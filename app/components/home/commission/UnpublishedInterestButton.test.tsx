// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import UnpublishedInterestButton from './UnpublishedInterestButton'

describe('UnpublishedInterestButton', () => {
  const mockRybbitEvent = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    mockRybbitEvent.mockClear()
    ;(window as Window & { rybbit?: { event?: typeof mockRybbitEvent } }).rybbit = {
      event: mockRybbitEvent,
    }
  })

  afterEach(() => {
    delete (window as Window & { rybbit?: { event?: typeof mockRybbitEvent } }).rybbit
  })

  it('tracks interest once and persists notified state per commission', () => {
    const { unmount } = render(
      <UnpublishedInterestButton commissionKey="artoria-pendragon-20240203" />,
    )

    const button = screen.getByRole('button', { name: 'Want this' })
    fireEvent.click(button)

    expect(mockRybbitEvent).toHaveBeenCalledTimes(1)
    expect(mockRybbitEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.iWantToSeeIt, {
      sub_event: 'artoria-pendragon-20240203',
    })
    expect(screen.getByRole('button', { name: '✔ Notified' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '✔ Notified' }))
    expect(mockRybbitEvent).toHaveBeenCalledTimes(1)

    unmount()
    render(<UnpublishedInterestButton commissionKey="artoria-pendragon-20240203" />)
    return waitFor(() => {
      expect(screen.getByRole('button', { name: '✔ Notified' })).toBeDisabled()
    })
  })
})
