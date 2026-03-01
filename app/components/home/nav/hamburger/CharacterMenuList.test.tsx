// @vitest-environment jsdom
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterNavItem } from '#lib/characters/nav'
import CharacterMenuList from './CharacterMenuList'

const mockScrollToHashTargetFromHrefWithoutHash = vi.fn(() => true)

vi.mock('#lib/navigation/hashAnchor', () => ({
  scrollToHashTargetFromHrefWithoutHash: (rawHref: string | null) =>
    mockScrollToHashTargetFromHrefWithoutHash(rawHref),
}))

describe('CharacterMenuList', () => {
  const timelineNavItems: CharacterNavItem[] = [
    {
      displayName: '2026',
      sectionId: 'timeline-year-2026',
      titleId: 'title-timeline-year-2026',
      sectionHash: '#timeline-year-2026',
      titleHash: '#title-timeline-year-2026',
    },
  ]

  beforeEach(() => {
    mockScrollToHashTargetFromHrefWithoutHash.mockClear()
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('expands active list by default and switches to stale list when stale section is clicked', () => {
    const close = vi.fn()

    render(
      <CommissionViewModeProvider>
        <CharacterMenuList
          active={[{ DisplayName: 'Artoria Pendragon' }]}
          stale={[{ DisplayName: 'Nero Claudius' }]}
          timelineNavItems={timelineNavItems}
          close={close}
        />
      </CommissionViewModeProvider>,
    )

    expect(screen.getByRole('button', { name: 'Active Characters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Stale Characters' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByRole('link', { name: 'Artoria Pendragon' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Nero Claudius' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stale Characters' }))

    expect(screen.getByRole('button', { name: 'Active Characters' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Stale Characters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.queryByRole('link', { name: 'Artoria Pendragon' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nero Claudius' })).toBeInTheDocument()
  })

  it('renders timeline items only in timeline mode and keeps hash write prevention', () => {
    const close = vi.fn()
    window.history.replaceState(null, '', '/?view=timeline')

    render(
      <CommissionViewModeProvider>
        <CharacterMenuList
          active={[{ DisplayName: 'Artoria Pendragon' }]}
          stale={[{ DisplayName: 'Nero Claudius' }]}
          timelineNavItems={timelineNavItems}
          close={close}
        />
      </CommissionViewModeProvider>,
    )

    expect(screen.queryByRole('button', { name: 'Active Characters' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stale Characters' })).not.toBeInTheDocument()

    const timelineLink = screen.getByRole('link', { name: '2026' })
    expect(timelineLink).toHaveAttribute('href', '/?view=timeline#timeline-year-2026')

    fireEvent.click(timelineLink)

    expect(mockScrollToHashTargetFromHrefWithoutHash).toHaveBeenCalledWith(
      '/?view=timeline#timeline-year-2026',
    )
    expect(close).toHaveBeenCalledTimes(1)
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/?view=timeline',
    )
  })

  it('disables links whose target sections are hidden when search state changes', () => {
    const close = vi.fn()

    render(
      <CommissionViewModeProvider>
        <div id="artoria-pendragon" />
        <div id="nero-claudius" className="hidden" />
        <CharacterMenuList
          active={[{ DisplayName: 'Artoria Pendragon' }, { DisplayName: 'Nero Claudius' }]}
          stale={[]}
          timelineNavItems={timelineNavItems}
          close={close}
        />
      </CommissionViewModeProvider>,
    )

    const artoriaLink = screen.getByRole('link', { name: 'Artoria Pendragon' })
    const neroLink = screen.getByRole('link', { name: 'Nero Claudius' })

    window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))

    expect(artoriaLink).not.toHaveAttribute('aria-disabled')
    expect(neroLink).toHaveAttribute('aria-disabled', 'true')
    expect(neroLink).toHaveAttribute('tabindex', '-1')
    expect(neroLink).toHaveClass('pointer-events-none', 'cursor-not-allowed')

    fireEvent.click(artoriaLink)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
