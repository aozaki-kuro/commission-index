// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import ProtectedCommissionImage from './ProtectedCommissionImage'

const { mockTrackRybbitEvent } = vi.hoisted(() => ({
  mockTrackRybbitEvent: vi.fn(),
}))

vi.mock('#lib/analytics/track', () => ({
  trackRybbitEvent: (...args: unknown[]) => mockTrackRybbitEvent(...args),
}))

describe('ProtectedCommissionImage', () => {
  it('reveals image after decode completes', async () => {
    mockTrackRybbitEvent.mockClear()
    render(<ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/sample.webp" />)

    const image = screen.getByRole('img', { name: 'sample alt' })
    expect(image).toHaveAttribute(
      'srcset',
      '/images/sample-960.webp 960w, /images/sample-1280.webp 1280w',
    )
    expect(image).toHaveAttribute('sizes', '(max-width: 768px) 92vw, 640px')
    Object.defineProperty(image, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    Object.defineProperty(image, 'naturalWidth', {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(image, 'currentSrc', {
      configurable: true,
      value: 'https://example.test/images/sample-960.webp',
    })

    fireEvent.load(image)

    await waitFor(() => {
      expect(image.className).toContain('opacity-100')
    })
    expect(mockTrackRybbitEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.commissionImageVariantLoaded,
      expect.objectContaining({
        variant: '960',
      }),
    )
  })

  it('shows fallback notice when image loading fails', () => {
    render(
      <ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/missing.webp" />,
    )

    const image = screen.getByRole('img', { name: 'sample alt' })
    fireEvent.error(image)

    expect(screen.getByText('image unavailable')).toBeInTheDocument()
    expect(image.className).toContain('opacity-0')
  })
})
