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
        initialQuery: 'maid',
        autoFocusOnMount: true,
        deferIndexInit: true,
      }),
    )
  })

  it('deduplicates creator aliases to a single popular term', () => {
    appendSearchEntry(['Creator\t七市', 'Creator\tNanashi', 'Keyword\tmaid'].join('\n'))
    appendSearchEntry(['Creator\t七市', 'Creator\tnanashi', 'Keyword\tkimono'].join('\n'))

    render(<CommissionSearchDeferred />)

    expect(screen.getAllByRole('button', { name: '七市' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Nanashi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'nanashi' })).not.toBeInTheDocument()
  })
})
