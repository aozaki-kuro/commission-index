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
  it('shows skeleton first and reveals image after load', async () => {
    mockTrackRybbitEvent.mockClear()
    render(<ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/sample.webp" />)

    const image = screen.getByRole('img', { name: 'sample alt' })
    const skeleton = screen.getByTestId('commission-image-skeleton')
    expect(image).toHaveAttribute(
      'srcset',
      '/images/sample-960.webp 960w, /images/sample-1280.webp 1280w',
    )
    expect(image).toHaveAttribute('sizes', '(max-width: 768px) 92vw, 640px')
    expect(image.className).toContain('opacity-0')
    expect(skeleton.className).toContain('opacity-100')
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
    expect(skeleton.className).toContain('opacity-0')
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
    const skeleton = screen.getByTestId('commission-image-skeleton')
    const fallback = screen.getByText('image unavailable')
    expect(fallback.className).toContain('hidden')

    fireEvent.error(image)

    expect(fallback.className).toContain('flex')
    expect(image.className).toContain('opacity-0')
    expect(skeleton.className).toContain('opacity-0')
  })

  it('reveals image when it has already completed before hydration handlers run', async () => {
    const completeGetter = vi
      .spyOn(HTMLImageElement.prototype, 'complete', 'get')
      .mockReturnValue(true)
    const naturalWidthGetter = vi
      .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
      .mockReturnValue(100)

    render(<ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/sample.webp" />)

    const image = screen.getByRole('img', { name: 'sample alt' })
    const skeleton = screen.getByTestId('commission-image-skeleton')

    await waitFor(() => {
      expect(image.className).toContain('opacity-100')
    })
    expect(skeleton.className).toContain('opacity-0')

    completeGetter.mockRestore()
    naturalWidthGetter.mockRestore()
  })
})
