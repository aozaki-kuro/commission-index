// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { CommissionViewModeProvider } from '#features/home/commission/CommissionViewMode'

describe('CommissionSearchDeferred focus behavior', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
  })

  it('keeps search input focusable on first activation and repeated focus attempts', async () => {
    const { default: CommissionSearchDeferred } = await import('./CommissionSearchDeferred')

    render(
      <CommissionViewModeProvider>
        <CommissionSearchDeferred />
      </CommissionViewModeProvider>,
    )

    const shellInput = screen.getByLabelText('Search commissions')
    shellInput.focus()
    expect(document.activeElement).toBe(shellInput)
    fireEvent.input(shellInput, { target: { value: 'a' } })

    await waitFor(() => {
      expect(document.activeElement).not.toBeNull()
      expect((document.activeElement as HTMLElement).id).toBe('commission-search-input')
    })

    const liveInput = screen.getByLabelText('Search commissions')
    const otherControl = document.createElement('button')
    document.body.appendChild(otherControl)
    otherControl.focus()
    expect(document.activeElement).toBe(otherControl)

    liveInput.focus()
    expect(document.activeElement).toBe(liveInput)

    otherControl.focus()
    liveInput.focus()
    expect(document.activeElement).toBe(liveInput)
  })
})
