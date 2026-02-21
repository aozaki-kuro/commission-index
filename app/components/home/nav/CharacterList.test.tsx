import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  beforeEach(() => {
    mockJumpToCommissionSearch.mockClear()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
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
})
