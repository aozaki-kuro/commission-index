// @vitest-environment jsdom
import type { ScrollDepthEventProperties } from './scrollDepthTracker'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountScrollDepthTracker } from './scrollDepthTracker'

const VIEWPORT_HEIGHT = 800
const ENTRY_HEIGHT = 400

let scrollY = 0
let isDesktop = false

function renderPanels({ characterTotal = 8, timelineTotal = 4 } = {}) {
  const activeEntries = Array.from({ length: 4 }, (_, i) => `<div data-commission-entry="true" data-index="${i}"></div>`).join('')
  const archivedEntries = Array.from({ length: 4 }, (_, i) => `<div data-commission-entry="true" data-index="${i + 4}"></div>`).join('')
  const timelineEntries = Array.from({ length: 4 }, (_, i) => `<div data-commission-entry="true" data-index="${i}"></div>`).join('')
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-commission-view-active="true" data-total-entries="${characterTotal}">
      <div data-character-status="active">${activeEntries}</div>
      <div data-character-status="archived">${archivedEntries}</div>
    </div>
    <div data-commission-view-panel="timeline" data-commission-view-active="false" data-total-entries="${timelineTotal}" class="hidden">
      ${timelineEntries}
    </div>
  `
}

function stubLayout() {
  // Entries stack vertically per panel; an inactive (display: none) panel has no boxes.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = Number(this.dataset.index ?? 0)
    const top = index * ENTRY_HEIGHT - scrollY
    return { top, bottom: top + ENTRY_HEIGHT, height: ENTRY_HEIGHT, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }
  })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    const panel = this.closest<HTMLElement>('[data-commission-view-panel]')
    const visible = panel?.dataset.commissionViewActive === 'true'
    return (visible ? [{}] : []) as unknown as DOMRectList
  })
}

async function scrollTo(y: number) {
  scrollY = y
  window.dispatchEvent(new Event('scroll'))
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
}

function setActivePanel(name: 'character' | 'timeline') {
  for (const panel of document.querySelectorAll<HTMLElement>('[data-commission-view-panel]'))
    panel.dataset.commissionViewActive = panel.dataset.commissionViewPanel === name ? 'true' : 'false'
}

describe('scrollDepthTracker', () => {
  beforeEach(() => {
    scrollY = 0
    isDesktop = false
    window.history.replaceState(null, '', '/')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query === '(min-width: 64rem)' && isDesktop }),
    })
    renderPanels()
    stubLayout()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('reports each crossed milestone once, as a share of the view total', async () => {
    const trackEvent = vi.fn<(properties: ScrollDepthEventProperties) => void>()
    const dispose = mountScrollDepthTracker({ trackEvent })

    // Entries 0-1 have entered the 800px viewport: 2 of 8 = 25%, crossing 5 and 10 on the way.
    await scrollTo(1)
    await vi.waitFor(() => {
      expect(trackEvent).toHaveBeenCalledTimes(3)
    })
    expect(trackEvent.mock.calls.map(([properties]) => properties.depth)).toEqual([5, 10, 25])
    expect(trackEvent).toHaveBeenLastCalledWith({ depth: 25, view_mode: 'character', layout: 'mobile', total_entries: 8 })

    // Scrolling back and forth over a reached milestone must not repeat it.
    await scrollTo(0)
    await scrollTo(1)
    expect(trackEvent).toHaveBeenCalledTimes(3)

    // Entry 3 (the last active one) entering = 4 of 8 = 50%.
    await scrollTo(1000)
    await vi.waitFor(() => {
      expect(trackEvent).toHaveBeenCalledTimes(4)
    })
    expect(trackEvent).toHaveBeenLastCalledWith(expect.objectContaining({ depth: 50 }))

    dispose()
  })

  it('counts only active-character entries, so expanded archived sections cannot inflate depth', async () => {
    renderPanels({ characterTotal: 4 })
    const trackEvent = vi.fn<(properties: ScrollDepthEventProperties) => void>()
    const dispose = mountScrollDepthTracker({ trackEvent })

    await scrollTo(3000)
    await vi.waitFor(() => {
      expect(trackEvent.mock.calls.map(([properties]) => properties.depth)).toEqual([5, 10, 25, 50, 75, 100])
    })

    dispose()
  })

  it('tracks the timeline view separately with its own total and the desktop layout', async () => {
    isDesktop = true
    const trackEvent = vi.fn<(properties: ScrollDepthEventProperties) => void>()
    const dispose = mountScrollDepthTracker({ trackEvent })

    await scrollTo(1)
    await vi.waitFor(() => {
      expect(trackEvent).toHaveBeenCalledTimes(3)
    })

    setActivePanel('timeline')
    // Back at the top: timeline entries 0-1 are in view = 2 of 4 = 50%.
    await scrollTo(0)
    await vi.waitFor(() => {
      expect(trackEvent).toHaveBeenCalledTimes(7)
    })
    expect(trackEvent.mock.calls.slice(3).map(([properties]) => properties)).toEqual([
      { depth: 5, view_mode: 'timeline', layout: 'desktop', total_entries: 4 },
      { depth: 10, view_mode: 'timeline', layout: 'desktop', total_entries: 4 },
      { depth: 25, view_mode: 'timeline', layout: 'desktop', total_entries: 4 },
      { depth: 50, view_mode: 'timeline', layout: 'desktop', total_entries: 4 },
    ])

    dispose()
  })

  it('stays silent while a search query filters the list', async () => {
    window.history.replaceState(null, '', '/?q=lucia')
    const trackEvent = vi.fn<(properties: ScrollDepthEventProperties) => void>()
    const dispose = mountScrollDepthTracker({ trackEvent })

    await scrollTo(3000)
    await scrollTo(3001)
    expect(trackEvent).not.toHaveBeenCalled()

    dispose()
  })

  it('stops reporting after dispose', async () => {
    const trackEvent = vi.fn<(properties: ScrollDepthEventProperties) => void>()
    const dispose = mountScrollDepthTracker({ trackEvent })
    dispose()

    await scrollTo(3000)
    await scrollTo(3001)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
