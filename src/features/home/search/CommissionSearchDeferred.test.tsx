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
  beforeEach(() => {
    mockCommissionSearch.mockClear()
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('does not mount lazy search before activation', () => {
    render(<CommissionSearchDeferred />)

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
})
