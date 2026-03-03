// @vitest-environment jsdom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import CommissionImageNoticeGate from './CommissionImageNoticeGate'

const { mockTrackRybbitEvent } = vi.hoisted(() => ({
  mockTrackRybbitEvent: vi.fn(),
}))

vi.mock('#lib/analytics/track', () => ({
  trackRybbitEvent: (...args: unknown[]) => mockTrackRybbitEvent(...args),
}))

describe('CommissionImageNoticeGate', () => {
  it('tracks loaded responsive image variant', async () => {
    mockTrackRybbitEvent.mockClear()
    const ui = render(
      <>
        <div data-commission-image="true" data-commission-alt="sample alt">
          <img data-commission-image-node="true" alt="sample alt" />
        </div>
        <CommissionImageNoticeGate />
      </>,
    )
    const image = ui.getByRole('img', { name: 'sample alt' })
    Object.defineProperty(image, 'currentSrc', {
      configurable: true,
      value: 'https://example.test/images/sample-960.webp',
    })

    fireEvent.load(image)

    await waitFor(() => {
      expect(mockTrackRybbitEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.commissionImageVariantLoaded,
        expect.objectContaining({
          variant: '960',
        }),
      )
    })
  })

  it('shows image notice on first image contextmenu', async () => {
    const ui = render(
      <>
        <div data-commission-image="true" data-commission-alt="sample alt">
          <img data-commission-image-node="true" alt="sample alt" />
        </div>
        <CommissionImageNoticeGate />
      </>,
    )
    const image = ui.getByRole('img', { name: 'sample alt' })

    fireEvent.contextMenu(image, { clientX: 20, clientY: 30 })

    await waitFor(() => {
      expect(document.querySelector('[role="status"]')).toHaveTextContent('sample alt')
    })
  })
})
