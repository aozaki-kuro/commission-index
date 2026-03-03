// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProtectedCommissionImage, { buildResponsiveSrcSet } from './ProtectedCommissionImage'

describe('ProtectedCommissionImage', () => {
  it('builds responsive srcset variants', () => {
    expect(buildResponsiveSrcSet('/images/sample.webp')).toBe(
      '/images/sample-960.webp 960w, /images/sample-1280.webp 1280w',
    )
    expect(buildResponsiveSrcSet('/images/sample.webp?v=1')).toBe(
      '/images/sample-960.webp?v=1 960w, /images/sample-1280.webp?v=1 1280w',
    )
    expect(buildResponsiveSrcSet('/images/sample')).toBe('')
  })

  it('renders lazily loaded image with srcset and explicit dimensions', () => {
    render(<ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/sample.webp" />)

    const image = screen.getByRole('img', { name: 'sample alt' })
    expect(image).toHaveAttribute('src', '/images/sample.webp')
    expect(image).toHaveAttribute(
      'srcset',
      '/images/sample-960.webp 960w, /images/sample-1280.webp 1280w',
    )
    expect(image).toHaveAttribute('sizes', '(max-width: 768px) 92vw, 640px')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('width', '1280')
    expect(image).toHaveAttribute('height', '525')
  })
})
