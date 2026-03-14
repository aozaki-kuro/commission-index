import type { CommissionSearchEntrySource } from './CommissionSearch'
import { ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT } from '#features/home/commission/activeCharactersEvent'
import { clearHomeCharacterBatchRequestCacheForTests } from '#features/home/commission/homeCharacterBatchClient'
import { clearHomeCharacterBatchManifestCacheForTests } from '#features/home/commission/homeCharacterBatchManifest'
import {
  STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CommissionSearch from './CommissionSearch'

const { mockTrackRybbitEvent } = vi.hoisted(() => ({
  mockTrackRybbitEvent: vi.fn(),
}))

vi.mock('#lib/analytics/track', () => ({
  trackRybbitEvent: (...args: unknown[]) => mockTrackRybbitEvent(...args),
}))

function renderSearch(externalEntries: CommissionSearchEntrySource[]) {
  return render(<CommissionSearch disableDomFiltering externalEntries={externalEntries} />)
}

function renderSearchWithProps(externalEntries: CommissionSearchEntrySource[], props: Partial<NonNullable<Parameters<typeof CommissionSearch>[0]>> = {}) {
  return render(<CommissionSearch disableDomFiltering externalEntries={externalEntries} {...props} />)
}

function renderSearchWithDomFiltering(externalEntries: CommissionSearchEntrySource[]) {
  return render(<CommissionSearch externalEntries={externalEntries} />)
}

describe('commissionSearch', () => {
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

  afterEach(() => {
    clearHomeCharacterBatchRequestCacheForTests()
    clearHomeCharacterBatchManifestCacheForTests(document)
    document.body.innerHTML = ''
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
    }
    finally {
      dispatchEventSpy.mockRestore()
    }
  })

  it('requests deferred active sections when character search starts with dom filtering', async () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    document.body.innerHTML = `
      <div
        data-commission-view-panel="character"
        data-commission-view-active="true"
        data-active-sections-loaded="false"
        data-stale-loaded="false"
        data-stale-visibility="hidden"
      ></div>
    `

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        domKey: 'section-alpha::20240101_alice',
        searchText: 'alice sample',
        searchSuggest: 'Character\tAlice',
      },
    ]

    try {
      renderSearchWithDomFiltering(entries)

      fireEvent.input(screen.getByLabelText('Search commissions'), {
        target: { value: 'ali' },
      })

      await waitFor(() => {
        expect(
          dispatchEventSpy.mock.calls.some(
            ([event]) =>
              event instanceof Event && event.type === ACTIVE_CHARACTERS_LOAD_REQUEST_EVENT,
          ),
        ).toBe(true)
      })
    }
    finally {
      dispatchEventSpy.mockRestore()
    }
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
        onRotatePopularKeywords: vi.fn(),
      })

      expect(screen.getByRole('button', { name: 'Refresh popular keywords' })).toBeInTheDocument()

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
    }
    finally {
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
    expect(screen.getByText('1 stale match hidden.')).toBeInTheDocument()
    expect(screen.getByText('Load')).toBeInTheDocument()

    const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')
    panel?.setAttribute('data-stale-loaded', 'true')
    const staleSection = document.createElement('section')
    staleSection.id = 'stale'
    staleSection.dataset.characterSection = 'true'
    staleSection.dataset.characterStatus = 'stale'
    staleSection.innerHTML
      = '<div data-commission-entry="true" data-character-section-id="stale" data-commission-search-key="stale::20240102_stale"></div>'
    panel?.append(staleSection)
    window.dispatchEvent(
      new CustomEvent(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
        detail: { visibility: 'visible', loaded: true },
      }),
    )

    await waitFor(() => {
      expect(screen.getByText('Search results: 1 of 2 commissions shown.')).toBeInTheDocument()
    })
    expect(screen.queryByText('1 stale match hidden.')).not.toBeInTheDocument()
  })

  it('reapplies the active search filter as soon as stale batches mount', async () => {
    document.body.innerHTML = `
      <div
        data-commission-view-panel="character"
        data-commission-view-active="true"
        data-active-sections-loaded="true"
        data-stale-loaded="false"
        data-stale-visibility="hidden"
        data-stale-batches-loaded-count="0"
      >
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
        domKey: 'stale::20240102_beta',
        searchText: 'beta',
      },
    ]

    renderSearchWithDomFiltering(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'alpha' } })

    await waitFor(() => {
      expect(screen.getByText('Search results: 1 of 1 commissions shown.')).toBeInTheDocument()
    })

    const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')
    panel?.setAttribute('data-stale-visibility', 'visible')
    panel?.setAttribute('data-stale-batches-loaded-count', '1')

    window.dispatchEvent(
      new CustomEvent(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
        detail: { visibility: 'visible', loaded: false },
      }),
    )

    const staleSection = document.createElement('section')
    staleSection.id = 'stale'
    staleSection.dataset.characterSection = 'true'
    staleSection.dataset.characterStatus = 'stale'
    staleSection.innerHTML
      = '<div data-commission-entry="true" data-character-section-id="stale" data-commission-search-key="stale::20240102_beta"></div>'
    panel?.append(staleSection)

    window.dispatchEvent(new Event(STALE_CHARACTERS_LOADED_EVENT))

    await waitFor(() => {
      expect(staleSection.classList.contains('hidden')).toBe(true)
      expect(
        staleSection
          .querySelector<HTMLElement>('[data-commission-entry="true"]')
          ?.classList
          .contains('hidden'),
      ).toBe(true)
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

      const itemLabel = await screen.findByText('Load')
      fireEvent.click(itemLabel)

      expect(
        dispatchEventSpy.mock.calls.some(
          ([event]) => event instanceof Event && event.type === STALE_CHARACTERS_LOAD_REQUEST_EVENT,
        ),
      ).toBe(true)
    }
    finally {
      dispatchEventSpy.mockRestore()
    }
  })
})
