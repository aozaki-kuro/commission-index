// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearHashIfTargetIsStale, scrollToHashTargetFromHrefWithoutHash } from './hashAnchor'

describe('hashAnchor utils', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  })

  it('scrolls to hash targets without mutating location hash', () => {
    const target = document.createElement('div')
    target.id = 'timeline-year-2026'
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    const didScroll = scrollToHashTargetFromHrefWithoutHash('#timeline-year-2026')

    expect(didScroll).toBe(true)
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('')
  })

  it('returns false when hash target cannot be resolved', () => {
    expect(scrollToHashTargetFromHrefWithoutHash('#missing')).toBe(false)
    expect(scrollToHashTargetFromHrefWithoutHash(null)).toBe(false)
  })

  it('clears hash when target is missing or offscreen', () => {
    window.history.replaceState(null, '', '/?view=timeline#missing')
    clearHashIfTargetIsStale()
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/?view=timeline',
    )

    const target = document.createElement('div')
    target.id = 'timeline-year-2026'
    target.getBoundingClientRect = () =>
      ({
        top: window.innerHeight + 10,
        bottom: window.innerHeight + 20,
        left: 0,
        right: 0,
        width: 10,
        height: 10,
        x: 0,
        y: window.innerHeight + 10,
        toJSON: () => ({}),
      }) as DOMRect
    document.body.appendChild(target)

    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2026')
    clearHashIfTargetIsStale()

    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/?view=timeline',
    )
  })

  it('keeps hash when target is still onscreen', () => {
    const target = document.createElement('div')
    target.id = 'timeline-year-2026'
    target.getBoundingClientRect = () =>
      ({
        top: 100,
        bottom: 120,
        left: 0,
        right: 0,
        width: 10,
        height: 20,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect
    document.body.appendChild(target)
    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2026')

    clearHashIfTargetIsStale()

    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/?view=timeline#timeline-year-2026',
    )
  })
})
