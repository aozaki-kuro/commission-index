// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterNavItem } from '#lib/characters/nav'
import Hamburger from './Hamburger'

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
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as Window & { rybbit?: { event?: (...args: unknown[]) => void } }).rybbit
  })

  it('keeps mobile nav container above content and renders only menu content entrypoint', () => {
    const { container } = render(
      <Hamburger
        active={[{ DisplayName: 'L*cia' }]}
        stale={[{ DisplayName: 'Ninomae' }]}
        timelineNavItems={timelineNavItems}
      />,
    )

    const wrapper = container.firstElementChild

    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('z-[90]')
    expect(screen.getByTestId('menu-content')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Jump to search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /switch view mode/i })).not.toBeInTheDocument()
  })
})
