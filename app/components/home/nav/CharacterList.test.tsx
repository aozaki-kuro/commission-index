// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import CharacterList from './CharacterList'

const mockJumpToCommissionSearch = vi.fn()

vi.mock('#components/home/nav/DevAdminLink', () => ({
  default: () => <a href="/admin">Admin</a>,
}))

vi.mock('#lib/characters/useCharacterScrollSpy', () => ({
  useCharacterScrollSpy: () => 'title-artoria-pendragon',
}))

vi.mock('#lib/navigation/jumpToCommissionSearch', () => ({
  jumpToCommissionSearch: () => mockJumpToCommissionSearch(),
}))

describe('CharacterList', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const characters = [{ DisplayName: 'Artoria Pendragon' }, { DisplayName: 'Nero Claudius' }]
  const mockRybbitEvent = vi.fn()

  beforeEach(() => {
    mockJumpToCommissionSearch.mockClear()
    mockRybbitEvent.mockClear()
    ;(window as Window & { rybbit?: { event?: typeof mockRybbitEvent } }).rybbit = {
      event: mockRybbitEvent,
    }
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    window.history.replaceState(null, '', '/')
    delete (window as Window & { rybbit?: { event?: typeof mockRybbitEvent } }).rybbit
  })

  it('renders character navigation links and triggers search jump', () => {
    process.env.NODE_ENV = 'development'
    render(<CharacterList characters={characters} />)

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

  it('shows admin link only in development mode', () => {
    process.env.NODE_ENV = 'development'
    const { rerender } = render(<CharacterList characters={characters} />)
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument()

    process.env.NODE_ENV = 'production'
    rerender(<CharacterList characters={characters} />)
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('tracks sidebar usage once across sidebar interactions', () => {
    process.env.NODE_ENV = 'production'
    render(<CharacterList characters={characters} />)

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

  it('hides sidebar dots while search query is active', async () => {
    process.env.NODE_ENV = 'production'

    const { container } = render(<CharacterList characters={characters} />)
    window.dispatchEvent(
      new CustomEvent('sidebar-search-state-change', {
        detail: { active: true, visibleSectionIds: ['nero-claudius'] },
      }),
    )
    const activeDot = container.querySelector<HTMLElement>(
      '[data-sidebar-dot-for="title-artoria-pendragon"]',
    )

    expect(activeDot).toBeTruthy()
    await waitFor(() => {
      expect(activeDot).toHaveClass('scale-0', 'opacity-0')
      expect(activeDot).not.toHaveClass('scale-100', 'opacity-100')
    })
  })

  it('keeps sidebar active dot when active character remains in filtered results', async () => {
    process.env.NODE_ENV = 'production'

    const { container } = render(<CharacterList characters={characters} />)
    const activeDot = container.querySelector<HTMLElement>(
      '[data-sidebar-dot-for="title-artoria-pendragon"]',
    )

    expect(activeDot).toBeTruthy()

    window.dispatchEvent(
      new CustomEvent('sidebar-search-state-change', {
        detail: { active: true, visibleSectionIds: ['artoria-pendragon'] },
      }),
    )

    await waitFor(() => {
      expect(activeDot).toHaveClass('scale-100', 'opacity-100')
      expect(activeDot).not.toHaveClass('scale-0', 'opacity-0')
    })
  })

  it('restores sidebar active dot after search filter is cleared', async () => {
    process.env.NODE_ENV = 'production'

    const { container } = render(<CharacterList characters={characters} />)
    const activeDot = container.querySelector<HTMLElement>(
      '[data-sidebar-dot-for="title-artoria-pendragon"]',
    )

    expect(activeDot).toBeTruthy()

    window.dispatchEvent(
      new CustomEvent('sidebar-search-state-change', {
        detail: { active: true, visibleSectionIds: ['nero-claudius'] },
      }),
    )

    await waitFor(() => {
      expect(activeDot).toHaveClass('scale-0', 'opacity-0')
    })

    window.dispatchEvent(
      new CustomEvent('sidebar-search-state-change', {
        detail: { active: false },
      }),
    )

    await waitFor(() => {
      expect(activeDot).toHaveClass('scale-100', 'opacity-100')
      expect(activeDot).not.toHaveClass('scale-0', 'opacity-0')
    })
  })
})
