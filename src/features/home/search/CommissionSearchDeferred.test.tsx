// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommissionSearchDeferred from './CommissionSearchDeferred'

const { mockCommissionSearch } = vi.hoisted(() => ({
  mockCommissionSearch: vi.fn(),
}))

vi.mock('#features/home/search/CommissionSearch', () => ({
  default: (props: Record<string, unknown>) => {
    mockCommissionSearch(props)
    return (
      <div data-testid="commission-search-lazy">
        {String((props.initialQuery as string | undefined) ?? '')}
      </div>
    )
  },
}))

describe('CommissionSearchDeferred', () => {
  const appendedEntries: HTMLElement[] = []
  const originalMatchMedia = window.matchMedia

  const stubMatchMedia = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }

  const appendSearchEntry = (searchSuggest: string) => {
    const element = document.createElement('article')
    element.dataset.commissionEntry = 'true'
    element.dataset.searchSuggest = searchSuggest
    document.body.appendChild(element)
    appendedEntries.push(element)
  }

  beforeEach(() => {
    mockCommissionSearch.mockClear()
    window.history.replaceState(null, '', '/')
    stubMatchMedia(false)
  })

  afterEach(() => {
    appendedEntries.splice(0).forEach(element => element.remove())
    window.history.replaceState(null, '', '/')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
  })

  it('does not mount lazy search before activation', () => {
    render(<CommissionSearchDeferred />)

    expect(mockCommissionSearch).not.toHaveBeenCalled()
    expect(screen.queryByTestId('commission-search-lazy')).not.toBeInTheDocument()
  })

  it('keeps shell input focus path without activating lazy search', () => {
    render(<CommissionSearchDeferred />)

    const input = screen.getByLabelText('Search commissions')
    fireEvent.pointerDown(input)
    fireEvent.focus(input)

    expect(mockCommissionSearch).not.toHaveBeenCalled()
    expect(screen.queryByTestId('commission-search-lazy')).not.toBeInTheDocument()
  })

  it('passes shell query to lazy search when activated from input', async () => {
    render(<CommissionSearchDeferred />)

    const input = screen.getByLabelText('Search commissions')
    fireEvent.change(input, { target: { value: 'alice' } })

    await waitFor(() => {
      expect(screen.getByTestId('commission-search-lazy')).toBeInTheDocument()
    })

    expect(mockCommissionSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        initialQuery: 'alice',
        autoFocusOnMount: true,
        openHelpOnMount: false,
        deferIndexInit: true,
      }),
    )
  })

  it('auto-enables lazy search when q query param exists', async () => {
    window.history.replaceState(null, '', '/?q=kana')

    render(<CommissionSearchDeferred />)

    await waitFor(() => {
      expect(mockCommissionSearch).toHaveBeenCalled()
    })

    const lastProps = mockCommissionSearch.mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined
    expect(lastProps).toBeDefined()
    expect(lastProps?.initialQuery).toBeUndefined()
    expect(lastProps?.autoFocusOnMount).toBe(false)
    expect(lastProps?.openHelpOnMount).toBe(false)
  })

  it('preserves help activation path flags for lazy search', async () => {
    render(<CommissionSearchDeferred />)

    fireEvent.click(screen.getByRole('button', { name: 'Search help' }))

    await waitFor(() => {
      expect(mockCommissionSearch).toHaveBeenCalled()
    })

    expect(mockCommissionSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        autoFocusOnMount: false,
        openHelpOnMount: true,
        deferIndexInit: true,
      }),
    )
  })

  it('activates lazy search when selecting a popular keyword chip', async () => {
    appendSearchEntry(['Date\t2025/01', 'Keyword\tmaid'].join('\n'))
    render(<CommissionSearchDeferred />)

    expect(screen.queryByRole('button', { name: '2025/01' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'maid' }))

    await waitFor(() => {
      expect(mockCommissionSearch).toHaveBeenCalled()
    })

    expect(mockCommissionSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        initialQuery: 'maid ',
        autoFocusOnMount: true,
        deferIndexInit: true,
      }),
    )
  })

  it('deduplicates creator aliases to a single popular term', () => {
    appendSearchEntry(['Creator\t七市', 'Creator\tNanashi', 'Keyword\tmaid'].join('\n'))
    appendSearchEntry(['Creator\t七市', 'Creator\tnanashi', 'Keyword\tkimono'].join('\n'))

    render(<CommissionSearchDeferred />)

    const visibleCreatorVariants = ['七市', 'Nanashi', 'nanashi'].filter(term =>
      screen.queryByRole('button', { name: term }),
    )
    expect(visibleCreatorVariants).toHaveLength(1)
  })

  it('shows only one keyword alias variant in a popular batch', () => {
    appendSearchEntry(['Keyword\tmaid', 'Keyword\t女仆', 'Keyword\tkimono'].join('\n'))
    appendSearchEntry(['Keyword\tmaid', 'Keyword\t女仆', 'Keyword\tapron'].join('\n'))

    render(
      <CommissionSearchDeferred suggestionAliasGroups={[{ term: 'maid', aliases: ['女仆'] }]} />,
    )

    const visibleKeywordVariants = ['maid', '女仆'].filter(term =>
      screen.queryByRole('button', { name: term }),
    )
    expect(visibleKeywordVariants).toHaveLength(1)
  })

  it('limits each popular keyword batch to four chips', () => {
    appendSearchEntry('Keyword\taa')
    appendSearchEntry('Keyword\tbb')
    appendSearchEntry('Keyword\tcc')
    appendSearchEntry('Keyword\tdd')
    appendSearchEntry('Keyword\tee')

    render(<CommissionSearchDeferred />)

    const visibleKeywords = ['aa', 'bb', 'cc', 'dd', 'ee'].filter(keyword =>
      screen.queryByRole('button', { name: keyword }),
    )
    expect(visibleKeywords).toHaveLength(4)
  })

  it('shows six popular keyword chips on desktop viewport', async () => {
    stubMatchMedia(true)

    appendSearchEntry('Keyword\taa')
    appendSearchEntry('Keyword\tbb')
    appendSearchEntry('Keyword\tcc')
    appendSearchEntry('Keyword\tdd')
    appendSearchEntry('Keyword\tee')
    appendSearchEntry('Keyword\tff')
    appendSearchEntry('Keyword\tgg')

    render(<CommissionSearchDeferred />)

    await waitFor(() => {
      const visibleKeywords = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'].filter(keyword =>
        screen.queryByRole('button', { name: keyword }),
      )
      expect(visibleKeywords).toHaveLength(6)
    })
  })

  it('prioritizes manually featured keywords on first batch', () => {
    render(
      <CommissionSearchDeferred
        featuredKeywords={['alpha', 'beta', 'gamma', 'delta', 'epsilon']}
      />,
    )

    expect(screen.getByRole('button', { name: 'alpha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'beta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'gamma' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'delta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'epsilon' })).not.toBeInTheDocument()
  })

  it('falls back to random pool batches after rotating featured keywords', () => {
    appendSearchEntry('Keyword\taa')
    appendSearchEntry('Keyword\tbb')
    appendSearchEntry('Keyword\tcc')
    appendSearchEntry('Keyword\tdd')
    appendSearchEntry('Keyword\tee')

    render(
      <CommissionSearchDeferred
        featuredKeywords={['alpha', 'beta', 'gamma', 'delta', 'epsilon']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh popular keywords' }))

    expect(screen.queryByRole('button', { name: 'alpha' })).not.toBeInTheDocument()
    const visiblePoolKeywords = ['aa', 'bb', 'cc', 'dd', 'ee'].filter(keyword =>
      screen.queryByRole('button', { name: keyword }),
    )
    expect(visiblePoolKeywords).toHaveLength(4)
  })
})
