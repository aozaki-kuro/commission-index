// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import CommissionImageNoticeGate from './CommissionImageNoticeGate'

const { mockTrackRybbitEvent, mockNoticeClient } = vi.hoisted(() => ({
  mockTrackRybbitEvent: vi.fn(),
  mockNoticeClient: vi.fn(),
}))

vi.mock('#lib/analytics/track', () => ({
  trackRybbitEvent: (...args: unknown[]) => mockTrackRybbitEvent(...args),
}))

vi.mock('#features/home/commission/CommissionImageNoticeClient', () => ({
  default: ({ initialNotice }: { initialNotice?: { text: string } | null }) => {
    mockNoticeClient(initialNotice)
    return <div data-testid="commission-image-notice">{initialNotice?.text ?? ''}</div>
  },
}))

const createTrackedImage = (src: string) => {
  const image = document.createElement('img')
  image.setAttribute('data-commission-image-node', 'true')
  image.src = src
  return image
}

describe('CommissionImageNoticeGate', () => {
  beforeEach(() => {
    mockTrackRybbitEvent.mockClear()
    mockNoticeClient.mockClear()
    document.body.innerHTML = ''
    Reflect.deleteProperty(window, 'requestIdleCallback')
    Reflect.deleteProperty(window, 'cancelIdleCallback')
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'requestIdleCallback')
    Reflect.deleteProperty(window, 'cancelIdleCallback')
  })

  it('keeps contextmenu behavior and lazy-renders notice client', async () => {
    render(<CommissionImageNoticeGate />)

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
      expect(screen.getByTestId('commission-image-notice')).toHaveTextContent('sample alt text')
    })
  })

  it('tracks load variant once per variant+dpr key via capture listener', () => {
    render(<CommissionImageNoticeGate />)

    const image = createTrackedImage('/images/webp/sample-960.webp')
    document.body.appendChild(image)

    image.dispatchEvent(new Event('load'))
    image.dispatchEvent(new Event('load'))

    expect(mockTrackRybbitEvent).toHaveBeenCalledTimes(1)
    expect(mockTrackRybbitEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.commissionImageVariantLoaded,
      expect.objectContaining({
        variant: '960',
        viewport_width: window.innerWidth,
      }),
    )
  })

  it('samples complete images during idle pass without duplicate tracking', async () => {
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

    const image = createTrackedImage('/images/webp/sample-1280.webp')
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

    render(<CommissionImageNoticeGate />)

    await waitFor(() => {
      expect(mockTrackRybbitEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.commissionImageVariantLoaded,
        expect.objectContaining({ variant: '1280' }),
      )
    })

    image.dispatchEvent(new Event('load'))

    expect(mockTrackRybbitEvent).toHaveBeenCalledTimes(1)
  })
})
