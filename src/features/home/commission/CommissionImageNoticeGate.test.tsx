// @vitest-environment jsdom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CommissionImageNoticeGate from './CommissionImageNoticeGate'

const renderStaticImageWithGate = () => {
  const ui = render(
    <>
      <div data-commission-image="true" data-commission-alt="sample alt">
        <div data-commission-image-skeleton="true" className="opacity-100" />
        <div data-commission-image-fallback="true" className="hidden" />
        <img data-commission-image-node="true" className="opacity-0" alt="sample alt" />
      </div>
      <CommissionImageNoticeGate />
    </>,
  )

  const image = ui.getByRole('img', { name: 'sample alt' })
  const skeleton = document.querySelector<HTMLElement>('[data-commission-image-skeleton="true"]')
  const fallback = document.querySelector<HTMLElement>('[data-commission-image-fallback="true"]')

  if (!skeleton || !fallback) {
    throw new Error('Failed to render image skeleton/fallback test nodes')
  }

  return { image, skeleton, fallback }
}

describe('CommissionImageNoticeGate image visibility enhancer', () => {
  it('reveals static image and hides skeleton when load fires', async () => {
    const { image, skeleton, fallback } = renderStaticImageWithGate()

    fireEvent.load(image)

    await waitFor(() => {
      expect(image.className).toContain('opacity-100')
    })
    expect(skeleton.className).toContain('opacity-0')
    expect(fallback.className).toContain('hidden')
  })

  it('shows fallback and hides skeleton when error fires', async () => {
    const { image, skeleton, fallback } = renderStaticImageWithGate()

    fireEvent.error(image)

    await waitFor(() => {
      expect(fallback.className).toContain('flex')
    })
    expect(image.className).toContain('opacity-0')
    expect(skeleton.className).toContain('opacity-0')
  })
})
