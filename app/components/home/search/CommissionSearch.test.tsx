// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CommissionViewModeProvider } from '#components/home/commission/CommissionViewMode'
import CommissionSearch, { type CommissionSearchEntrySource } from './CommissionSearch'

const renderSearch = (externalEntries: CommissionSearchEntrySource[]) =>
  render(
    <CommissionViewModeProvider>
      <CommissionSearch disableDomFiltering externalEntries={externalEntries} />
    </CommissionViewModeProvider>,
  )

describe('CommissionSearch', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  it('applies suggestion from command list', () => {
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        searchText: 'alice sample tag',
        searchSuggest: 'Character\tAlice\nKeyword\ttag',
      },
    ]

    renderSearch(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'ali' } })

    const suggestion = screen.getByText('Alice')
    fireEvent.click(suggestion)

    expect(input.value).toContain('Alice')
  })

  it('opens search help modal from help button', async () => {
    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        searchText: 'blue sample',
        searchSuggest: 'Keyword\tblue',
      },
    ]

    renderSearch(entries)

    fireEvent.click(screen.getByRole('button', { name: 'Search help' }))
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    })
  })

  it('copies search url when copy button clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const entries: CommissionSearchEntrySource[] = [
      {
        id: 1,
        searchText: 'alice sample',
        searchSuggest: 'Character\tAlice',
      },
    ]

    renderSearch(entries)

    const input = screen.getByLabelText('Search commissions') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'alice' } })

    fireEvent.click(screen.getByRole('button', { name: 'Copy search URL' }))

    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
