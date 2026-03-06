// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
