// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProtectedCommissionImage from './ProtectedCommissionImage'

describe('ProtectedCommissionImage', () => {
  it('renders the fallback source when no static image is provided', () => {
    const { container } = render(
      <ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/webp/sample.webp" />,
    )

    expect(screen.getByRole('img', { name: 'sample alt' })).toHaveAttribute(
      'src',
      '/images/webp/sample.webp',
    )
    expect(container.querySelector('[data-commission-image="true"]')).toHaveAttribute(
      'data-commission-alt',
      'sample alt',
    )
  })
})
