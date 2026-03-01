// @vitest-environment jsdom
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterNavItem } from '#lib/characters/nav'
import MenuContent from './MenuContent'

const mockJumpToCommissionSearch = vi.fn()

vi.mock('#lib/navigation/jumpToCommissionSearch', () => ({
  jumpToCommissionSearch: (...args: unknown[]) => mockJumpToCommissionSearch(...args),
}))

vi.mock('./CharacterMenuList', () => ({
  default: () => <div data-testid="character-menu-list" />,
}))

const timelineNavItems: CharacterNavItem[] = [
  {
    displayName: '2026',
    sectionId: 'timeline-year-2026',
    titleId: 'title-timeline-year-2026',
    sectionHash: '#timeline-year-2026',
    titleHash: '#title-timeline-year-2026',
  },
]

describe('MenuContent', () => {
  beforeEach(() => {
    mockJumpToCommissionSearch.mockClear()
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders utility actions inside menu and keeps expected mobile z-index layering classes', () => {
    const close = vi.fn()

    render(
      <CommissionViewModeProvider>
        <MenuContent
          mounted
          open
          close={close}
          toggle={() => {}}
          active={[{ DisplayName: 'L*cia' }]}
          stale={[{ DisplayName: 'Ninomae' }]}
          timelineNavItems={timelineNavItems}
        />
      </CommissionViewModeProvider>,
    )

    const closeButton = screen.getByRole('button', { name: 'Close navigation menu' })
    const toggleButton = screen.getByRole('button', { name: 'Open navigation menu' })
    const menuPanel = document.getElementById('mobile-character-menu')

    expect(closeButton.tagName).toBe('BUTTON')
    expect(toggleButton.tagName).toBe('BUTTON')
    expect(closeButton.className).toContain('z-[60]')
    expect(toggleButton.className).toContain('z-[70]')
    expect(menuPanel).not.toBeNull()
    expect(menuPanel?.className).toContain('z-[80]')
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'By Character' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'By Date' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(mockJumpToCommissionSearch).toHaveBeenCalledWith({ topGap: 40, focusMode: 'immediate' })
    expect(close).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'By Date' }))
    expect(screen.getByRole('button', { name: 'By Character' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'By Date' })).toHaveAttribute('aria-pressed', 'true')
  })
})
