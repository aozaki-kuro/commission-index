// @vitest-environment jsdom
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterNavItem } from '#lib/characters/nav'
import Hamburger from './Hamburger'

const mockJumpToCommissionSearch = vi.fn()

vi.mock('#lib/navigation/jumpToCommissionSearch', () => ({
  jumpToCommissionSearch: (...args: unknown[]) => mockJumpToCommissionSearch(...args),
}))

vi.mock('./hamburger/MenuContent', () => ({
  preloadCharacterMenuList: () => {},
  default: () => <div data-testid="menu-content" />,
}))

describe('Hamburger', () => {
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
    mockJumpToCommissionSearch.mockClear()
  })

  afterEach(() => {
    delete (window as Window & { rybbit?: { event?: (...args: unknown[]) => void } }).rybbit
  })

  it('keeps mobile nav container above content and renders search jump button', () => {
    render(
      <CommissionViewModeProvider>
        <Hamburger
          active={[{ DisplayName: 'L*cia' }]}
          stale={[{ DisplayName: 'Ninomae' }]}
          timelineNavItems={timelineNavItems}
        />
      </CommissionViewModeProvider>,
    )

    const wrapper = screen.getByRole('button', { name: 'Jump to search' }).closest('div')
    const searchButton = screen.getByRole('button', { name: 'Jump to search' })
    const modeSwitchButton = screen.getByRole('button', { name: /switch view mode/i })

    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('z-[90]')
    expect(searchButton.tagName).toBe('BUTTON')
    expect(modeSwitchButton).toHaveAttribute('title', 'By Character')
    expect(modeSwitchButton).toHaveAttribute('aria-pressed', 'false')
    expect(modeSwitchButton).toHaveAttribute('data-view-mode', 'character')

    fireEvent.click(searchButton)
    expect(mockJumpToCommissionSearch).toHaveBeenCalledTimes(1)

    fireEvent.click(modeSwitchButton)
    expect(screen.getByRole('button', { name: /switch view mode/i })).toHaveAttribute(
      'title',
      'By Date',
    )
    expect(screen.getByRole('button', { name: /switch view mode/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /switch view mode/i })).toHaveAttribute(
      'data-view-mode',
      'timeline',
    )
  })
})
