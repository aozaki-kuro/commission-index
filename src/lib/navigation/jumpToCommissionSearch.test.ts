// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jumpToCommissionSearch } from './jumpToCommissionSearch'

describe('jumpToCommissionSearch', () => {
  const originalScrollTo = window.scrollTo
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    window.scrollTo = vi.fn() as typeof window.scrollTo
    Object.defineProperty(window, 'scrollY', { value: 120, writable: true, configurable: true })
    globalThis.requestAnimationFrame = vi.fn(cb => {
      cb(0)
      return 1
    }) as typeof requestAnimationFrame
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    window.scrollTo = originalScrollTo
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  })

  it('returns safely when search section is missing', () => {
    expect(() => jumpToCommissionSearch()).not.toThrow()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('scrolls only without focusing when focusMode is none', () => {
    document.body.innerHTML = `
      <section id="commission-search"></section>
      <input id="commission-search-input" value="abc" />
    `
    const section = document.getElementById('commission-search') as HTMLElement
    const input = document.getElementById('commission-search-input') as HTMLInputElement

    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({
      top: 80,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const focusSpy = vi.spyOn(input, 'focus')
    const clickSpy = vi.spyOn(input, 'click')

    jumpToCommissionSearch({ focusMode: 'none', topGap: 24 })

    expect(window.scrollTo).toHaveBeenCalledTimes(1)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 176, behavior: 'smooth' })
    expect(focusSpy).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('runs deferred focus flow and places cursor at end', () => {
    document.body.innerHTML = `
      <section id="commission-search"></section>
      <input id="commission-search-input" value="vitest query" />
    `
    const section = document.getElementById('commission-search') as HTMLElement
    const input = document.getElementById('commission-search-input') as HTMLInputElement

    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({
      top: 50,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const focusSpy = vi.spyOn(input, 'focus')
    const clickSpy = vi.spyOn(input, 'click')
    const selectionSpy = vi.spyOn(input, 'setSelectionRange')

    jumpToCommissionSearch({ focusDelayMs: 160 })

    expect(window.scrollTo).toHaveBeenCalledTimes(1)
    expect(focusSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(160)

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    expect(clickSpy).not.toHaveBeenCalled()
    expect(selectionSpy).toHaveBeenCalledWith(input.value.length, input.value.length)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 146, behavior: 'smooth' })

    vi.advanceTimersByTime(100)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 146, behavior: 'auto' })
    expect(window.scrollTo).toHaveBeenCalledTimes(3)
  })

  it('runs immediate focus flow without deferred recenter timers', () => {
    document.body.innerHTML = `
      <section id="commission-search"></section>
      <input id="commission-search-input" value="quick query" />
    `
    const section = document.getElementById('commission-search') as HTMLElement
    const input = document.getElementById('commission-search-input') as HTMLInputElement

    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({
      top: 70,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    const focusSpy = vi.spyOn(input, 'focus')
    const clickSpy = vi.spyOn(input, 'click')
    const selectionSpy = vi.spyOn(input, 'setSelectionRange')

    jumpToCommissionSearch({ focusMode: 'immediate', topGap: 40 })

    expect(window.scrollTo).toHaveBeenCalledTimes(1)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 150, behavior: 'auto' })
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    expect(clickSpy).not.toHaveBeenCalled()
    expect(selectionSpy).toHaveBeenCalledWith(input.value.length, input.value.length)

    vi.runOnlyPendingTimers()
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
  })
})
