// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import CharacterList from './CharacterList'

const mockJumpToCommissionSearch = vi.fn()

vi.mock('#features/home/nav/DevAdminLink', () => ({
  default: () => <a href="/admin">Admin</a>,
}))

vi.mock('#lib/characters/useCharacterScrollSpy', () => ({
  useCharacterScrollSpy: (titleIds: string[]) => titleIds[0] ?? '',
}))

vi.mock('#lib/characters/useTimelineScrollSpy', () => ({
  useTimelineScrollSpy: (titleIds: string[]) => titleIds[0] ?? '',
}))

vi.mock('#lib/navigation/jumpToCommissionSearch', () => ({
  jumpToCommissionSearch: () => mockJumpToCommissionSearch(),
}))

describe('CharacterList', () => {
  const characters = [{ DisplayName: 'Artoria Pendragon' }, { DisplayName: 'Nero Claudius' }]

  beforeEach(() => {
    mockJumpToCommissionSearch.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders links and triggers search jump', () => {
    vi.stubEnv('NODE_ENV', 'development')

    render(
      <CommissionViewModeProvider>
        <CharacterList characters={characters} />
      </CommissionViewModeProvider>,
    )

    expect(screen.getByRole('link', { name: 'Artoria Pendragon' })).toHaveAttribute(
      'href',
      '#artoria-pendragon',
    )

    fireEvent.click(screen.getByRole('link', { name: 'Search' }))
    expect(mockJumpToCommissionSearch).toHaveBeenCalledTimes(1)
  })

  it('disables links whose target sections are hidden during search', () => {
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
  })
})
