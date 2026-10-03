// @vitest-environment jsdom
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '@features/home/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCommissionViewModeDomSync } from './commissionViewModeDomSync'

describe('mountCommissionViewModeDomSync scroll memory', () => {
  let scrollY = 0
  let scrollTo: ReturnType<typeof vi.fn>
  let cleanup: () => void

  const switchTo = (mode: 'character' | 'timeline') => {
    window.history.replaceState(null, '', mode === 'timeline' ? '/?view=timeline' : '/')
    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true"></div>
      <div data-commission-view-panel="timeline" data-commission-view-active="false" class="hidden"></div>
    `
    window.history.replaceState(null, '', '/')
    scrollY = 0
    scrollTo = vi.fn((options: ScrollToOptions) => {
      scrollY = options.top ?? 0
    })
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    cleanup = mountCommissionViewModeDomSync()
  })

  afterEach(() => {
    cleanup()
  })

  it('starts an unvisited view at the top and restores each view on return', () => {
    scrollY = 1200
    switchTo('timeline')
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }))

    scrollY = 300
    switchTo('character')
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 1200 }))

    switchTo('timeline')
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 300 }))
  })

  it('does not touch scroll on initial mount', () => {
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
