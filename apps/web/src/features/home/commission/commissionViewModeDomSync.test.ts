// @vitest-environment jsdom
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '@features/home/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCommissionViewModeDomSync } from './commissionViewModeDomSync'

describe('mountCommissionViewModeDomSync scroll memory', () => {
  let scrollY = 0
  let scrollTo: ReturnType<typeof vi.fn>
  let cleanup: () => void

  const switchTo = (mode: 'character' | 'timeline') => {
    window.history.replaceState(null, '', mode === 'timeline'
      ? '/?view=timeline'
      : '/')
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
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    })
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

describe('mountCommissionViewModeDomSync interrupted transitions', () => {
  let scrollY = 0
  let scrollTo: ReturnType<typeof vi.fn>
  let cleanup: () => void

  const panel = (mode: 'character' | 'timeline') =>
    document.querySelector<HTMLElement>(`[data-commission-view-panel="${mode}"]`)!

  const switchTo = (mode: 'character' | 'timeline') => {
    window.history.replaceState(null, '', mode === 'timeline'
      ? '/?view=timeline'
      : '/')
    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
  }

  const expectSettledOn = (mode: 'character' | 'timeline') => {
    const other = mode === 'character'
      ? 'timeline'
      : 'character'
    expect(panel(mode).classList.contains('hidden')).toBe(false)
    expect(panel(mode).dataset.commissionViewActive).toBe('true')
    expect(panel(other).classList.contains('hidden')).toBe(true)
    expect(panel(other).dataset.commissionViewActive).toBe('false')
    for (const el of [
      panel(mode),
      panel(other),
    ]) {
      expect(el.style.opacity).toBe('')
      expect(el.style.transition).toBe('')
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true"></div>
      <div data-commission-view-panel="timeline" data-commission-view-active="false" class="hidden"></div>
    `
    window.history.replaceState(null, '', '/')
    scrollY = 0
    scrollTo = vi.fn((options: ScrollToOptions) => {
      scrollY = options.top ?? 0
    })
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    })
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    cleanup = mountCommissionViewModeDomSync()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('stays on the view switched back to during the fade-out', async () => {
    switchTo('timeline')
    await vi.advanceTimersByTimeAsync(50)
    switchTo('character')
    await vi.advanceTimersByTimeAsync(1000)

    expectSettledOn('character')
  })

  it('switches back with scroll memory when interrupted during the fade-in', async () => {
    scrollY = 1200
    switchTo('timeline')
    await vi.advanceTimersByTimeAsync(210)
    expect(panel('timeline').classList.contains('hidden')).toBe(false)

    scrollY = 300
    switchTo('character')
    await vi.advanceTimersByTimeAsync(1000)

    expectSettledOn('character')
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 1200 }))
  })

  it('drops a pending transition on teardown', async () => {
    switchTo('timeline')
    cleanup()
    cleanup = () => {}
    await vi.advanceTimersByTimeAsync(1000)

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
