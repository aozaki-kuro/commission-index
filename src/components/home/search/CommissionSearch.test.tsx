// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import CommissionSearch, { type CommissionSearchEntrySource } from './CommissionSearch'

const { mockTrackRybbitEvent } = vi.hoisted(() => ({
  mockTrackRybbitEvent: vi.fn(),
}))

vi.mock('#lib/analytics/track', () => ({
  trackRybbitEvent: (...args: unknown[]) => mockTrackRybbitEvent(...args),
}))

const renderSearch = (externalEntries: CommissionSearchEntrySource[]) =>
  render(
    <CommissionViewModeProvider>
      <CommissionSearch disableDomFiltering externalEntries={externalEntries} />
    </CommissionViewModeProvider>,
  )

describe('CommissionSearch', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  it('applies suggestion from command list', () => {
    mockTrackRybbitEvent.mockClear()
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_sample',
        searchText: 'alice sample tag',
        searchSuggest: 'Character\tAlice\nKeyword\ttag',
      },
    ]

    renderSearch(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'ali' } })

    fireEvent.click(screen.getByText('Alice'))

    expect(input.value).toContain('Alice')
    expect(mockTrackRybbitEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.searchUsed,
      expect.objectContaining({
        source: 'input',
        result_count: 1,
      }),
    )
    const searchEventPayload = mockTrackRybbitEvent.mock.calls.find(
      ([eventName]) => eventName === ANALYTICS_EVENTS.searchUsed,
    )?.[1] as Record<string, unknown> | undefined
    expect(searchEventPayload).toBeDefined()
    expect(searchEventPayload).not.toHaveProperty('query_length')
    expect(searchEventPayload).not.toHaveProperty('trackable_query_length')
  })

  it('copies search url when copy button clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_alice',
        searchText: 'alice sample',
        searchSuggest: 'Character\tAlice',
      },
    ]

    renderSearch(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'alice' } })

    fireEvent.click(screen.getByRole('button', { name: 'Copy search URL' }))

    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
