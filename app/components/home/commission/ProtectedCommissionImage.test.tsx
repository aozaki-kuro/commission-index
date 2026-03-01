// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProtectedCommissionImage from './ProtectedCommissionImage'

describe('ProtectedCommissionImage', () => {
  it('reveals image after decode completes', async () => {
    render(<ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/sample.webp" />)

    const image = screen.getByRole('img', { name: 'sample alt' })
    Object.defineProperty(image, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    Object.defineProperty(image, 'naturalWidth', {
      configurable: true,
      value: 100,
    })

    fireEvent.load(image)

    await waitFor(() => {
      expect(image.className).toContain('opacity-100')
    })
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
