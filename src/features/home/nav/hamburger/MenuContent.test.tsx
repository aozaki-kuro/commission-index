// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'
import type { CharacterNavItem } from '#lib/characters/nav'
import MenuContent from './MenuContent'

const { mockJumpToCommissionSearch, mockTrackRybbitEvent } = vi.hoisted(() => ({
  mockJumpToCommissionSearch: vi.fn(),
  mockTrackRybbitEvent: vi.fn(),
}))

vi.mock('#lib/navigation/jumpToCommissionSearch', () => ({
  jumpToCommissionSearch: (...args: unknown[]) => mockJumpToCommissionSearch(...args),
}))

vi.mock('#lib/analytics/track', () => ({
  trackRybbitEvent: (...args: unknown[]) => mockTrackRybbitEvent(...args),
}))

vi.mock('./CharacterMenuList', () => ({
  default: () => <div data-testid="character-menu-list">CharacterMenuList</div>,
}))

describe('MenuContent search activation', () => {
  const timelineNavItems: CharacterNavItem[] = [
    {
      displayName: '2026',
      sectionId: 'timeline-year-2026',
      titleId: 'title-timeline-year-2026',
      sectionHash: '#timeline-year-2026',
      titleHash: '#title-timeline-year-2026',
    },
  ]

  it('handles pointer and click fallback without duplicate runs', () => {
    mockJumpToCommissionSearch.mockClear()
    mockTrackRybbitEvent.mockClear()
    const close = vi.fn()

    render(
      <CommissionViewModeProvider>
        <MenuContent
          mounted
          open
          close={close}
          toggle={() => {}}
          active={[{ DisplayName: 'Artoria' }]}
          stale={[]}
          timelineNavItems={timelineNavItems}
        />
      </CommissionViewModeProvider>,
    )

    const searchButton = screen.getByRole('button', { name: 'Search' })
    expect(document.documentElement.classList.contains('overflow-hidden')).toBe(true)
    expect(document.documentElement.classList.contains('touch-none')).toBe(true)

    fireEvent.pointerDown(searchButton)
    expect(mockJumpToCommissionSearch).toHaveBeenCalledTimes(1)
    expect(mockJumpToCommissionSearch).toHaveBeenLastCalledWith({
      topGap: 40,
      focusMode: 'immediate',
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains('overflow-hidden')).toBe(false)
    expect(document.documentElement.classList.contains('touch-none')).toBe(false)

    fireEvent.click(searchButton)
    expect(mockJumpToCommissionSearch).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)

    fireEvent.click(searchButton)
    expect(mockJumpToCommissionSearch).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledTimes(2)
  })
})
