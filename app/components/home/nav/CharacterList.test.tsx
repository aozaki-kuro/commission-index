// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import type { ReactNode } from 'react'
import CharacterList from './CharacterList'

const mockJumpToCommissionSearch = vi.fn()
const mockClearHashIfTargetIsStale = vi.fn()
const mockScrollToHashTargetFromHrefWithoutHash = vi.fn(() => true)

vi.mock('#components/home/nav/DevAdminLink', () => ({
  default: () => <a href="/admin">Admin</a>,
}))

vi.mock('#lib/characters/useCharacterScrollSpy', () => ({
  useCharacterScrollSpy: () => 'title-artoria-pendragon',
}))

vi.mock('#lib/navigation/jumpToCommissionSearch', () => ({
  jumpToCommissionSearch: () => mockJumpToCommissionSearch(),
}))

vi.mock('#lib/navigation/hashAnchor', () => ({
  clearHashIfTargetIsStale: () => mockClearHashIfTargetIsStale(),
  scrollToHashTargetFromHrefWithoutHash: (rawHref: string | null) =>
    mockScrollToHashTargetFromHrefWithoutHash(rawHref),
}))

describe('CharacterList', () => {
  const characters = [{ DisplayName: 'Artoria Pendragon' }, { DisplayName: 'Nero Claudius' }]
  const monthNavItems = [
    {
      displayName: '2026',
      sectionId: 'timeline-year-2026',
      titleId: 'title-timeline-year-2026',
      sectionHash: '#timeline-year-2026',
      titleHash: '#title-timeline-year-2026',
    },
  ]
  const mockRybbitEvent = vi.fn()

  const renderCharacterList = (ui: ReactNode) =>
    render(<CommissionViewModeProvider>{ui}</CommissionViewModeProvider>)

  beforeEach(() => {
    mockJumpToCommissionSearch.mockClear()
    mockClearHashIfTargetIsStale.mockClear()
    mockScrollToHashTargetFromHrefWithoutHash.mockClear()
    mockRybbitEvent.mockClear()
    ;(window as Window & { rybbit?: { event?: typeof mockRybbitEvent } }).rybbit = {
      event: mockRybbitEvent,
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
    delete (window as Window & { rybbit?: { event?: typeof mockRybbitEvent } }).rybbit
  })

  it('renders character navigation links and triggers search jump', () => {
    vi.stubEnv('NODE_ENV', 'development')
    renderCharacterList(<CharacterList characters={characters} />)

    expect(screen.getByRole('link', { name: 'Artoria Pendragon' })).toHaveAttribute(
      'href',
      '#artoria-pendragon',
    )
    expect(screen.getByRole('link', { name: 'Nero Claudius' })).toHaveAttribute(
      'href',
      '#nero-claudius',
    )

    fireEvent.click(screen.getByRole('link', { name: 'Search' }))
    expect(mockJumpToCommissionSearch).toHaveBeenCalledTimes(1)
  })

  it('tracks sidebar usage once across sidebar interactions', () => {
    vi.stubEnv('NODE_ENV', 'production')
    renderCharacterList(<CharacterList characters={characters} />)

    fireEvent.click(screen.getByRole('link', { name: 'Artoria Pendragon' }))
    fireEvent.click(screen.getByRole('link', { name: 'Search' }))

    expect(mockRybbitEvent).toHaveBeenCalledTimes(1)
    expect(mockRybbitEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.sidebarNavUsed,
      expect.objectContaining({
        source: 'character_link',
        item_count: 2,
      }),
    )
  })

  it('tracks sidebar view mode toggle clicks with target mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    renderCharacterList(<CharacterList characters={characters} />)

    fireEvent.click(screen.getByRole('button', { name: 'By Date' }))

    expect(mockRybbitEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.sidebarViewModeToggleUsed,
      expect.objectContaining({
        from_mode: 'character',
        to_mode: 'timeline',
        already_active: false,
      }),
    )
  })

  it('keeps timeline sidebar anchor clicks from writing hash to url', () => {
    vi.stubEnv('NODE_ENV', 'production')
    window.history.replaceState(null, '', '/?view=timeline')

    const { container } = renderCharacterList(
      <CharacterList characters={characters} monthNavItems={monthNavItems} />,
    )

    expect(screen.getByRole('link', { name: '2026' })).toHaveAttribute(
      'href',
      '#timeline-year-2026',
    )
    expect(container.querySelector('[data-sidebar-dot-for]')).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: '2026' }))

    expect(mockScrollToHashTargetFromHrefWithoutHash).toHaveBeenCalledTimes(1)
    expect(mockScrollToHashTargetFromHrefWithoutHash).toHaveBeenCalledWith('#timeline-year-2026')
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/?view=timeline',
    )
  })

  it('runs stale hash cleanup on mount and scroll in timeline mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2026')
    const rafCallbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    renderCharacterList(<CharacterList characters={characters} monthNavItems={monthNavItems} />)

    expect(rafCallbacks).toHaveLength(1)
    rafCallbacks.shift()?.(0)
    expect(mockClearHashIfTargetIsStale).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('scroll'))
    expect(rafCallbacks).toHaveLength(1)
    rafCallbacks.shift()?.(0)
    expect(mockClearHashIfTargetIsStale).toHaveBeenCalledTimes(2)
  })

  it('disables sidebar character links whose sections are hidden during search', () => {
    vi.stubEnv('NODE_ENV', 'production')

    render(
      <CommissionViewModeProvider>
        <div id="artoria-pendragon" />
        <div id="nero-claudius" className="hidden" />
        <CharacterList characters={characters} />
      </CommissionViewModeProvider>,
    )

    const artoriaLink = screen.getByRole('link', { name: 'Artoria Pendragon' })
    const neroLink = screen.getByRole('link', { name: 'Nero Claudius' })

    window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))

    expect(artoriaLink).not.toHaveAttribute('aria-disabled')
    expect(neroLink).toHaveAttribute('aria-disabled', 'true')
    expect(neroLink).toHaveAttribute('tabindex', '-1')
    expect(neroLink).toHaveClass('pointer-events-none', 'cursor-not-allowed')

    fireEvent.click(neroLink)
    expect(mockRybbitEvent).not.toHaveBeenCalled()
  })
})
