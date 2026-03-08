// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import CommissionSearch, { type CommissionSearchEntrySource } from './CommissionSearch'

const { mockTrackRybbitEvent } = vi.hoisted(() => ({
  mockTrackRybbitEvent: vi.fn(),
}))

vi.mock('#lib/analytics/track', () => ({
  trackRybbitEvent: (...args: unknown[]) => mockTrackRybbitEvent(...args),
}))

const renderSearch = (externalEntries: CommissionSearchEntrySource[]) =>
  render(<CommissionSearch disableDomFiltering externalEntries={externalEntries} />)

const renderSearchWithProps = (
  externalEntries: CommissionSearchEntrySource[],
  props: Partial<NonNullable<Parameters<typeof CommissionSearch>[0]>> = {},
) => render(<CommissionSearch disableDomFiltering externalEntries={externalEntries} {...props} />)

const renderSearchWithDomFiltering = (externalEntries: CommissionSearchEntrySource[]) =>
  render(<CommissionSearch externalEntries={externalEntries} />)

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
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_sample',
        searchText: 'alice sample tag',
        searchSuggest: 'Character\tAlice\nKeyword\ttag',
      },
    ]

    try {
      renderSearch(entries)

      const input = screen.getByLabelText('Search commissions') as HTMLInputElement
      fireEvent.focus(input)
      fireEvent.input(input, { target: { value: 'ali' } })

      await waitFor(() => {
        const controlsId = input.getAttribute('aria-controls')
        expect(controlsId).toBeTruthy()
        expect(document.getElementById(controlsId!)).toBeInTheDocument()
        expect(input).toHaveAttribute('aria-expanded', 'true')
      })

      fireEvent.click(screen.getByText('Alice'))

      expect(input.value).toContain('Alice')
      expect(
        dispatchEventSpy.mock.calls.some(
          ([event]) =>
            event instanceof Event && event.type === STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
        ),
      ).toBe(false)
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
    } finally {
      dispatchEventSpy.mockRestore()
    }
  })

  it('closes suggestion panel on Escape and reopens after query changes', async () => {
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
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'ali' } })

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'true')
    })

    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })

    fireEvent.input(input, { target: { value: 'alic' } })

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('rebuilds the timeline DOM mapping after timeline sections are mounted', async () => {
    try {
      window.history.replaceState(null, '', '/?view=timeline')
      document.body.innerHTML = `
        <div data-commission-view-panel="character" data-commission-view-active="false"></div>
        <div
          data-commission-view-panel="timeline"
          data-commission-view-active="true"
          data-timeline-loaded="false"
        >
          <div data-timeline-sections-container="true"></div>
        </div>
      `

      const entries: CommissionSearchEntrySource[] = [
        {
          id: 1,
          domKey: 'timeline-year-2025::20240101_alice',
          searchText: 'alice sample',
        },
      ]

      renderSearchWithDomFiltering(entries)

      const input = screen.getByLabelText('Search commissions') as HTMLInputElement
      fireEvent.input(input, { target: { value: 'zzz' } })

      const timelineContainer = document.querySelector<HTMLElement>(
        '[data-timeline-sections-container="true"]',
      )
      timelineContainer?.insertAdjacentHTML(
        'beforeend',
        `
          <section id="timeline-year-2025" data-character-section="true">
            <div
              data-commission-entry="true"
              data-character-section-id="timeline-year-2025"
              data-commission-search-key="timeline-year-2025::20240101_alice"
            ></div>
          </section>
        `,
      )
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.setAttribute('data-timeline-loaded', 'true')

      const entry = document.querySelector<HTMLElement>('[data-commission-entry="true"]')
      expect(entry?.classList.contains('hidden')).toBe(false)

      window.dispatchEvent(new Event(TIMELINE_VIEW_LOADED_EVENT))

      await waitFor(() => {
        expect(entry?.classList.contains('hidden')).toBe(true)
      })
    } finally {
      window.history.replaceState(null, '', '/')
    }
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

  it('keeps popular keyword chips visible and applies selected keyword', async () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_kanaut',
        searchText: 'kanaut nishe sample',
        searchSuggest: 'Creator\tKanaut Nishe\nKeyword\tsample',
      },
    ]

    try {
      renderSearchWithProps(entries, {
        popularKeywords: ['Kanaut Nishe', 'sample'],
        refreshPopularSearchLabel: 'Refresh popular keywords',
      })

      const input = screen.getByLabelText('Search commissions') as HTMLInputElement
      fireEvent.click(screen.getByRole('button', { name: 'Kanaut Nishe' }))

      await waitFor(() => {
        expect(input.value).toBe('"Kanaut Nishe" ')
      })
      expect(
        dispatchEventSpy.mock.calls.some(
          ([event]) =>
            event instanceof Event && event.type === STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
        ),
      ).toBe(false)
      expect(document.querySelector('[cmdk-list]')).not.toBeInTheDocument()

      expect(screen.getByRole('button', { name: 'Kanaut Nishe' })).toBeInTheDocument()
    } finally {
      dispatchEventSpy.mockRestore()
    }
  })

  it('shows shared alias suffix for keyword and character suggestions', async () => {
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'test-character::20240101_nanashi',
        searchText: 'nanashi sample',
        searchSuggest: 'Character\tNanashi\nCreator\tNanashi\nKeyword\tsample',
      },
      {
        id: 2,
        domKey: 'test-character::20240102_aitsuki',
        searchText: 'aitsuki nakuru sample',
        searchSuggest: 'Character\tAitsuki Nakuru\nKeyword\tAitsuki Nakuru',
      },
    ]

    renderSearchWithProps(entries, {
      suggestionAliasGroups: [
        { term: 'Nanashi', aliases: ['七市'] },
        { term: 'Aitsuki Nakuru', aliases: ['あいつき なくる'] },
        { term: 'Aitsuki Nakuru', aliases: ['should-not-show'] },
      ],
    })

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'nana' } })

    await waitFor(() => {
      expect(screen.getByText('(七市)')).toBeInTheDocument()
    })

    fireEvent.input(input, { target: { value: 'aitsuki' } })

    await waitFor(() => {
      expect(screen.getByText('(あいつき なくる)')).toBeInTheDocument()
    })
    expect(screen.queryByText('should-not-show')).not.toBeInTheDocument()
  })

  it('keeps stale entries searchable before load and reindexes after stale loaded event', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="false">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_alpha"></div>
        </section>
      </div>
    `

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_alpha',
        searchText: 'alpha',
      },
      {
        id: 2,
        domKey: 'stale::20240102_stale',
        searchText: 'staleword',
      },
    ]

    renderSearchWithDomFiltering(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'staleword' } })

    await waitFor(() => {
      expect(
        screen.getAllByText(/Search results: 0 of 1 commissions shown\./).length,
      ).toBeGreaterThan(0)
    })
    expect(screen.getByText('1 matching stale commission is hidden.')).toBeInTheDocument()
    expect(screen.getByText('Load stale characters')).toBeInTheDocument()

    const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')
    panel?.setAttribute('data-stale-loaded', 'true')
    const staleSection = document.createElement('section')
    staleSection.id = 'stale'
    staleSection.dataset.characterSection = 'true'
    staleSection.dataset.characterStatus = 'stale'
    staleSection.innerHTML =
      '<div data-commission-entry="true" data-character-section-id="stale" data-commission-search-key="stale::20240102_stale"></div>'
    panel?.append(staleSection)
    window.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))

    await waitFor(() => {
      expect(screen.getByText('Search results: 1 of 2 commissions shown.')).toBeInTheDocument()
    })
    expect(screen.queryByText('1 matching stale commission is hidden.')).not.toBeInTheDocument()
  })

  it('dismisses a hidden stale notice panel on outside click', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="false">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_alpha"></div>
        </section>
      </div>
    `

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_alpha',
        searchText: 'alpha',
      },
      {
        id: 2,
        domKey: 'stale::20240102_stale',
        searchText: 'staleword',
      },
    ]

    renderSearchWithDomFiltering(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'staleword' } })

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).toBeInTheDocument()
      expect(screen.getByText('1 matching stale commission is hidden.')).toBeInTheDocument()
    })

    fireEvent.pointerDown(document.body)

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('dismisses a hidden stale notice panel on global Escape', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="false">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_alpha"></div>
        </section>
      </div>
    `

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_alpha',
        searchText: 'alpha',
      },
      {
        id: 2,
        domKey: 'stale::20240102_stale',
        searchText: 'staleword',
      },
    ]

    renderSearchWithDomFiltering(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'staleword' } })

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).toBeInTheDocument()
    })

    input.blur()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('keeps the suggestion panel closed after mouse selection even when the input refocuses', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="false">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_nanashi"></div>
        </section>
      </div>
    `

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_nanashi',
        searchText: 'nanashi active',
        searchSuggest: 'Character	Nanashi',
      },
      {
        id: 2,
        domKey: 'stale::20240102_nanashi',
        searchText: 'nanashi stale',
        searchSuggest: 'Character	Nanashi',
      },
    ]

    renderSearchWithDomFiltering(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'nana' } })

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).toBeInTheDocument()
      expect(screen.getByText('Nanashi')).toBeInTheDocument()
      expect(screen.getByText('Load stale characters')).toBeInTheDocument()
    })

    fireEvent.blur(input)
    fireEvent.click(screen.getByText('Nanashi'))

    await waitFor(() => {
      expect(input.value).toContain('Nanashi')
      expect(document.querySelector('[cmdk-list]')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('preserves loaded stale sections when applying a suggestion', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="true">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_nanashi"></div>
        </section>
        <section id="stale" data-character-section="true" data-character-status="stale">
          <div data-commission-entry="true" data-character-section-id="stale" data-commission-search-key="stale::20240102_nanashi"></div>
        </section>
      </div>
    `

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_nanashi',
        searchText: 'nanashi active',
        searchSuggest: 'Character	Nanashi',
      },
      {
        id: 2,
        domKey: 'stale::20240102_nanashi',
        searchText: 'nanashi stale',
        searchSuggest: 'Character	Nanashi',
      },
    ]

    try {
      renderSearchWithDomFiltering(entries)

      const input = screen.getByLabelText('Search commissions') as HTMLInputElement
      fireEvent.focus(input)
      fireEvent.input(input, { target: { value: 'nana' } })

      await waitFor(() => {
        expect(document.querySelector('[cmdk-list]')).toBeInTheDocument()
        expect(screen.getByText('Nanashi')).toBeInTheDocument()
        expect(screen.queryByText('Load stale characters')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Nanashi'))

      await waitFor(() => {
        expect(document.querySelector('[cmdk-list]')).not.toBeInTheDocument()
        expect(input.value).toContain('Nanashi')
      })

      expect(
        dispatchEventSpy.mock.calls.some(
          ([event]) =>
            event instanceof Event && event.type === STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
        ),
      ).toBe(false)
      expect(
        document
          .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
          ?.getAttribute('data-stale-loaded'),
      ).toBe('true')
    } finally {
      dispatchEventSpy.mockRestore()
    }
  })

  it('closes suggestion panel after applying a suggestion while stale results remain hidden', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="false">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_nanashi"></div>
        </section>
      </div>
    `

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_nanashi',
        searchText: 'nanashi active',
        searchSuggest: 'Character\tNanashi',
      },
      {
        id: 2,
        domKey: 'stale::20240102_nanashi',
        searchText: 'nanashi stale',
        searchSuggest: 'Character\tNanashi',
      },
    ]

    renderSearchWithDomFiltering(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'nana' } })

    await waitFor(() => {
      expect(document.querySelector('[cmdk-list]')).toBeInTheDocument()
      expect(screen.getByText('Nanashi')).toBeInTheDocument()
      expect(screen.getByText('Load stale characters')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Nanashi'))

    await waitFor(() => {
      expect(input.value).toContain('Nanashi')
      expect(document.querySelector('[cmdk-list]')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('requests stale loading from the inline notice item on click', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="false">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_alpha"></div>
        </section>
      </div>
    `

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_alpha',
        searchText: 'alpha',
      },
      {
        id: 2,
        domKey: 'stale::20240102_stale',
        searchText: 'staleword',
      },
    ]

    try {
      renderSearchWithDomFiltering(entries)

      const input = screen.getByLabelText('Search commissions') as HTMLInputElement
      fireEvent.input(input, { target: { value: 'staleword' } })

      const itemLabel = await screen.findByText('Load stale characters')
      fireEvent.click(itemLabel)

      expect(
        dispatchEventSpy.mock.calls.some(
          ([event]) => event instanceof Event && event.type === STALE_CHARACTERS_LOAD_REQUEST_EVENT,
        ),
      ).toBe(true)
    } finally {
      dispatchEventSpy.mockRestore()
    }
  })

  it('allows keyboard selection of the stale load item inside the dropdown', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-stale-loaded="false">
        <section id="active" data-character-section="true" data-character-status="active">
          <div data-commission-entry="true" data-character-section-id="active" data-commission-search-key="active::20240101_nanashi"></div>
        </section>
      </div>
    `

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'active::20240101_nanashi',
        searchText: 'nanashi active',
        searchSuggest: 'Character\tNanashi',
      },
      {
        id: 2,
        domKey: 'stale::20240102_nanashi',
        searchText: 'nanashi stale',
        searchSuggest: 'Character\tNanashi',
      },
    ]

    try {
      renderSearchWithDomFiltering(entries)

      const input = screen.getByLabelText('Search commissions') as HTMLInputElement
      fireEvent.focus(input)
      fireEvent.input(input, { target: { value: 'nana' } })

      const staleItem = await screen.findByText('Load stale characters')

      fireEvent.keyDown(input, { key: 'ArrowDown' })

      await waitFor(() => {
        expect(staleItem.closest('[cmdk-item]')).toHaveAttribute('data-selected', 'true')
      })

      fireEvent.keyDown(input, { key: 'Enter' })

      expect(
        dispatchEventSpy.mock.calls.some(
          ([event]) => event instanceof Event && event.type === STALE_CHARACTERS_LOAD_REQUEST_EVENT,
        ),
      ).toBe(true)
    } finally {
      dispatchEventSpy.mockRestore()
    }
  })
})
