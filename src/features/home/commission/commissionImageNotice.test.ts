import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { waitFor } from '@testing-library/react'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCommissionImageNoticeClient } from './commissionImageNoticeClient'
import { createCommissionImageVariantTracker } from './commissionImageVariantTracker'

function createTrackedImage(src: string, options?: { srcSet?: string, currentSrc?: string }) {
  const image = document.createElement('img')
  image.setAttribute('data-commission-image-node', 'true')
  image.src = src
  if (options?.srcSet) {
    image.setAttribute('srcset', options.srcSet)
  }
  if (options?.currentSrc) {
    Object.defineProperty(image, 'currentSrc', {
      configurable: true,
      get: () => options.currentSrc ?? src,
    })
  }
  return image
}

describe('commissionImageNotice', () => {
  let cleanupNotice: (() => void) | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    cleanupNotice = null
    Reflect.deleteProperty(window, 'requestIdleCallback')
    Reflect.deleteProperty(window, 'cancelIdleCallback')
  })

  afterEach(() => {
    cleanupNotice?.()
    Reflect.deleteProperty(window, 'requestIdleCallback')
    Reflect.deleteProperty(window, 'cancelIdleCallback')
  })

  it('keeps contextmenu behavior and renders notice text', async () => {
    cleanupNotice = mountCommissionImageNoticeClient()

    const container = document.createElement('div')
    container.setAttribute('data-commission-image', 'true')
    container.setAttribute('data-commission-alt', 'sample alt text')
    const child = document.createElement('span')
    container.appendChild(child)
    document.body.appendChild(container)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 80,
      clientY: 120,
    })
    child.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)

    await waitFor(() => {
      const notice = document.querySelector<HTMLElement>('[data-commission-image-notice="true"]')
      expect(notice?.textContent).toBe('sample alt text')
    })
  })

  it('tracks load variant once per variant+dpr key via srcset width descriptor', () => {
    const trackEvent = vi.fn()
    const tracker = createCommissionImageVariantTracker(trackEvent, window, document)

    const image = createTrackedImage('/_astro/sample.webp?w=768', {
      srcSet:
        '/_astro/sample.webp?w=768 768w, /_astro/sample.webp?w=960 960w, /_astro/sample.webp?w=1280 1280w',
      currentSrc: '/_astro/sample.webp?w=960',
    })
    document.body.appendChild(image)

    tracker.handleImageLoadCaptureEvent({ target: image } as unknown as Event)
    tracker.handleImageLoadCaptureEvent({ target: image } as unknown as Event)

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.commissionImageVariantLoaded,
      expect.objectContaining({
        variant: '960',
        viewport_width: window.innerWidth,
      }),
    )
  })

  it('samples complete images during idle pass without duplicate tracking', async () => {
    const trackEvent = vi.fn()
    const tracker = createCommissionImageVariantTracker(trackEvent, window, document)

    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: (callback: () => void) => {
        callback()
        return 1
      },
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: vi.fn(),
    })

    const image = createTrackedImage('/_astro/sample.webp?w=768', {
      srcSet:
        '/_astro/sample.webp?w=768 768w, /_astro/sample.webp?w=960 960w, /_astro/sample.webp?w=1280 1280w',
      currentSrc: '/_astro/sample.webp?w=1280',
    })
    Object.defineProperty(image, 'complete', { configurable: true, value: true })
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 900 })
    image.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 20,
      top: 20,
      left: 0,
      right: 200,
      bottom: 120,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    }))
    document.body.appendChild(image)

    const cleanupIdleSampling = tracker.scheduleIdleSampling(() => {
      tracker.sampleLoadedImagesNearViewport()
    })

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.commissionImageVariantLoaded,
        expect.objectContaining({ variant: '1280' }),
      )
    })

    tracker.handleImageLoadCaptureEvent({ target: image } as unknown as Event)
    expect(trackEvent).toHaveBeenCalledTimes(1)

    cleanupIdleSampling()
  })
})
