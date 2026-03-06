// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SearchShell from './SearchShell'

const baseProps = {
  query: '',
  onQueryChange: () => {},
  searchLabel: 'Search commissions',
  searchPlaceholder: 'Search',
  searchHelpLabel: 'Search help',
}

describe('SearchShell loading panel', () => {
  it('does not render loading panel before activation', () => {
    render(<SearchShell {...baseProps} showLoadingPanel={false} />)

    expect(screen.queryByTestId('search-loading-panel')).not.toBeInTheDocument()
  })

  it('renders and animates loading panel when activated', () => {
    render(<SearchShell {...baseProps} showLoadingPanel loadingLabel="..." />)

    const panel = screen.getByTestId('search-loading-panel')
    expect(panel).toBeInTheDocument()
    expect(panel.classList.contains('animate-search-dropdown-in')).toBe(true)
  })

  it('renders popular keyword chips with icon-style refresh action', () => {
    const onRotatePopularKeywords = vi.fn()
    const onPopularKeywordSelect = vi.fn()
    render(
      <SearchShell
        {...baseProps}
        showLoadingPanel={false}
        refreshPopularSearchLabel="Refresh popular keywords"
        popularKeywords={['maid', 'kimono']}
        onRotatePopularKeywords={onRotatePopularKeywords}
        onPopularKeywordSelect={onPopularKeywordSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh popular keywords' }))
    expect(onRotatePopularKeywords).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'maid' }))
    expect(onPopularKeywordSelect).toHaveBeenCalledWith('maid')
  })

  it('keeps a skeleton placeholder for popular keywords during loading panel handoff', () => {
    render(
      <SearchShell
        {...baseProps}
        query=""
        showLoadingPanel
        loadingLabel="..."
        popularKeywords={['maid', 'kimono']}
      />,
    )

    expect(screen.getByTestId('search-loading-panel')).toBeInTheDocument()
    expect(screen.getByTestId('search-popular-keywords-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'maid' })).not.toBeInTheDocument()
  })

  it('reserves space before popular keywords are loaded', () => {
    render(<SearchShell {...baseProps} reservePopularKeywordsSpace />)

    expect(screen.getByTestId('search-popular-keywords-skeleton')).toBeInTheDocument()
  })
})
