// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'
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

const renderSearchWithProps = (
  externalEntries: CommissionSearchEntrySource[],
  props: Partial<NonNullable<Parameters<typeof CommissionSearch>[0]>> = {},
) =>
  render(
    <CommissionViewModeProvider>
      <CommissionSearch disableDomFiltering externalEntries={externalEntries} {...props} />
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
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      })
    }
  })

  it('applies suggestion from command list', async () => {
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
    await waitFor(() => {
      expect(mockTrackRybbitEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.searchUsed,
        expect.objectContaining({
          source: 'input',
          result_count: 1,
        }),
      )
    })
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

  it('does not scan commission DOM when external entries are provided with disableDomFiltering', () => {
    const querySelectorAllSpy = vi.spyOn(document, 'querySelectorAll')
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_alice',
        searchText: 'alice sample',
        searchSuggest: 'Character\tAlice',
      },
    ]
    try {
      renderSearch(entries)

      const queriedSelectors = querySelectorAllSpy.mock.calls
        .map(([selector]) => selector)
        .filter((value): value is string => typeof value === 'string')

      expect(queriedSelectors).not.toContain('[data-commission-entry="true"]')
      expect(queriedSelectors).not.toContain('[data-character-section="true"]')
    } finally {
      querySelectorAllSpy.mockRestore()
    }
  })

  it('opens help popover on mount when openHelpOnMount is true', async () => {
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_alice',
        searchText: 'alice sample',
        searchSuggest: 'Character\tAlice',
      },
    ]

    renderSearchWithProps(entries, { openHelpOnMount: true })

    await waitFor(() => {
      expect(screen.getByText('Search Help')).toBeInTheDocument()
    })
  })

  it('ignores the first trigger click after auto-open, then allows closing', async () => {
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_alice',
        searchText: 'alice sample',
        searchSuggest: 'Character\tAlice',
      },
    ]

    renderSearchWithProps(entries, { openHelpOnMount: true })

    await waitFor(() => {
      expect(screen.getByText('Search Help')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Search help' }))
    expect(screen.getByText('Search Help')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Search help' }))
    await waitFor(() => {
      expect(screen.queryByText('Search Help')).not.toBeInTheDocument()
    })
  })

  it('suppresses initial suggestion panel animation for deferred handoff query', async () => {
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_alice',
        searchText: 'alice sample',
        searchSuggest: 'Character\tAlice',
      },
    ]

    renderSearchWithProps(entries, {
      initialQuery: 'ali',
      suppressInitialSuggestionPanelAnimation: true,
    })

    await waitFor(() => {
      const panel = document.querySelector('[cmdk-list]') as HTMLElement | null
      expect(panel).toBeTruthy()
      expect(panel?.classList.contains('animate-search-dropdown-in')).toBe(false)
    })

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'alice' } })

    await waitFor(() => {
      const panel = document.querySelector('[cmdk-list]') as HTMLElement | null
      expect(panel?.classList.contains('animate-search-dropdown-in')).toBe(true)
    })
  })

  it('keeps popular keyword chips visible and applies selected keyword', async () => {
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_kanaut',
        searchText: 'kanaut nishe sample',
        searchSuggest: 'Creator\tKanaut Nishe\nKeyword\tsample',
      },
    ]

    renderSearchWithProps(entries, {
      popularKeywords: ['Kanaut Nishe', 'sample'],
      refreshPopularSearchLabel: 'Refresh popular keywords',
    })

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Kanaut Nishe' }))

    await waitFor(() => {
      expect(input.value).toBe('Kanaut Nishe')
    })

    expect(screen.getByRole('button', { name: 'Kanaut Nishe' })).toBeInTheDocument()
  })
})
