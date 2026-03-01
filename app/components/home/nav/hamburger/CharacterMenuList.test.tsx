// @vitest-environment jsdom
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
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
    window.history.replaceState(null, '', '/?view=timeline')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders timeline links and prevents hash write while closing menu', () => {
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
})
