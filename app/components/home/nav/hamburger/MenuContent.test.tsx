// @vitest-environment jsdom
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CharacterNavItem } from '#lib/characters/nav'
import MenuContent from './MenuContent'

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
  it('renders native buttons with expected mobile z-index layering classes', () => {
    render(
      <CommissionViewModeProvider>
        <MenuContent
          mounted
          open
          close={() => {}}
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
  })
})
