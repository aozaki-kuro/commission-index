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
    const popularKeywords = (props.popularKeywords as string[] | undefined) ?? []
    const rotateLabel = (props.refreshPopularSearchLabel as string | undefined) ?? 'Refresh'
    const onRotate = props.onRotatePopularKeywords as (() => void) | undefined

    return (
      <div data-testid="commission-search">
        <div data-testid="commission-search-defer-flag">{String(props.deferIndexInit)}</div>
        {onRotate ? (
          <button type="button" onClick={onRotate}>
            {rotateLabel}
          </button>
        ) : null}
        {popularKeywords.map(keyword => (
          <button key={keyword} type="button">
            {keyword}
          </button>
        ))}
      </div>
    )
  },
}))

describe('CommissionSearchDeferred', () => {
  const appendedEntries: HTMLElement[] = []

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
  })

  afterEach(() => {
    appendedEntries.splice(0).forEach(element => element.remove())
    window.history.replaceState(null, '', '/')
  })

  it('renders the real search immediately and keeps deferIndexInit enabled', () => {
    render(<CommissionSearchDeferred />)

    expect(screen.getByTestId('commission-search')).toBeInTheDocument()
    expect(screen.getByTestId('commission-search-defer-flag')).toHaveTextContent('true')
    expect(mockCommissionSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        deferIndexInit: true,
      }),
    )
  })

  it('deduplicates creator aliases to a single popular term', async () => {
    appendSearchEntry(['Creator\t七市', 'Creator\tNanashi', 'Keyword\tmaid'].join('\n'))
    appendSearchEntry(['Creator\t七市', 'Creator\tnanashi', 'Keyword\tkimono'].join('\n'))

    render(<CommissionSearchDeferred />)

    await waitFor(() => {
      const visibleCreatorVariants = ['七市', 'Nanashi', 'nanashi'].filter(term =>
        screen.queryByRole('button', { name: term }),
      )
      expect(visibleCreatorVariants).toHaveLength(1)
    })
  })

  it('shows only one keyword alias variant in a popular batch', async () => {
    appendSearchEntry(['Keyword\tmaid', 'Keyword\t女仆', 'Keyword\tkimono'].join('\n'))
    appendSearchEntry(['Keyword\tmaid', 'Keyword\t女仆', 'Keyword\tapron'].join('\n'))

    render(
      <CommissionSearchDeferred suggestionAliasGroups={[{ term: 'maid', aliases: ['女仆'] }]} />,
    )

    await waitFor(() => {
      const visibleKeywordVariants = ['maid', '女仆'].filter(term =>
        screen.queryByRole('button', { name: term }),
      )
      expect(visibleKeywordVariants).toHaveLength(1)
    })
  })

  it('prepares up to six popular keyword chips per batch', async () => {
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
    expect(screen.getByRole('button', { name: 'epsilon' })).toBeInTheDocument()
  })

  it('falls back to pool batches after rotating featured keywords', async () => {
    appendSearchEntry('Keyword\taa')
    appendSearchEntry('Keyword\tbb')
    appendSearchEntry('Keyword\tcc')
    appendSearchEntry('Keyword\tdd')
    appendSearchEntry('Keyword\tee')
    appendSearchEntry('Keyword\tff')
    appendSearchEntry('Keyword\tgg')

    render(
      <CommissionSearchDeferred
        featuredKeywords={['alpha', 'beta', 'gamma', 'delta', 'epsilon']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh popular keywords' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'alpha' })).not.toBeInTheDocument()
      const visiblePoolKeywords = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'].filter(keyword =>
        screen.queryByRole('button', { name: keyword }),
      )
      expect(visiblePoolKeywords).toHaveLength(6)
    })
  })
})
