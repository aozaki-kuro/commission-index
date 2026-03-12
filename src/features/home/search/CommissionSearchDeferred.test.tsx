// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    element.dataset.searchText = searchSuggest.replaceAll('\n', ' ').toLowerCase()
    element.dataset.commissionSearchKey = `visible-${appendedEntries.length}`
    document.body.appendChild(element)
    appendedEntries.push(element)
  }

  const appendStaleTemplateEntry = ({
    searchText,
    searchSuggest,
  }: {
    searchText: string
    searchSuggest: string
  }) => {
    const template = document.createElement('template')
    template.dataset.staleSectionsTemplate = 'true'
    template.innerHTML = `
      <section>
        <article
          data-commission-entry="true"
          data-commission-search-key="stale-template"
          data-search-text="${searchText}"
          data-search-suggest="${searchSuggest}"
        ></article>
      </section>
    `
    document.body.appendChild(template)
    appendedEntries.push(template)
  }

  const appendActiveTemplateEntry = ({
    searchText,
    searchSuggest,
  }: {
    searchText: string
    searchSuggest: string
  }) => {
    const template = document.createElement('template')
    template.dataset.activeSectionsTemplate = 'true'
    template.innerHTML = `
      <section>
        <article
          data-commission-entry="true"
          data-commission-search-key="active-template"
          data-search-text="${searchText}"
          data-search-suggest="${searchSuggest}"
        ></article>
      </section>
    `
    document.body.appendChild(template)
    appendedEntries.push(template)
  }

  beforeEach(() => {
    mockCommissionSearch.mockClear()
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    appendedEntries.splice(0).forEach(element => element.remove())
    window.history.replaceState(null, '', '/')
    vi.unstubAllGlobals()
  })

  it('renders the real search immediately and keeps deferIndexInit enabled', async () => {
    const { default: CommissionSearchDeferred } = await loadDeferredModule()

    render(<CommissionSearchDeferred />)

    expect(screen.getByTestId('commission-search')).toBeInTheDocument()
    expect(screen.getByTestId('commission-search-defer-flag')).toHaveTextContent('true')
    expect(mockCommissionSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        deferIndexInit: true,
      }),
    )
  })

  it('passes template-backed active and stale entries to search in development', async () => {
    const { default: CommissionSearchDeferred } = await loadDeferredModule()

    appendSearchEntry('Keyword\tvisible')
    appendActiveTemplateEntry({
      searchText: 'activeword hidden',
      searchSuggest: 'Character\tActive',
    })
    appendStaleTemplateEntry({
      searchText: 'staleword hidden',
      searchSuggest: 'Character\tStale',
    })

    render(<CommissionSearchDeferred />)

    await waitFor(() => {
      expect(mockCommissionSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          externalEntries: expect.arrayContaining([
            expect.objectContaining({
              domKey: 'active-template',
              searchText: 'activeword hidden',
            }),
            expect.objectContaining({
              domKey: 'stale-template',
              searchText: 'staleword hidden',
            }),
          ]),
        }),
      )
    })
  })

  it('shows only one keyword alias variant in a popular batch', async () => {
    const { default: CommissionSearchDeferred } = await loadDeferredModule()

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

  it('prioritizes featured keywords first, then rotates into pooled keywords', async () => {
    const { default: CommissionSearchDeferred } = await loadDeferredModule()

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

    expect(screen.getByRole('button', { name: 'alpha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'beta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'gamma' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'delta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'epsilon' })).toBeInTheDocument()

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

const loadDeferredModule = async () => {
  vi.resetModules()
  return import('./CommissionSearchDeferred')
}
