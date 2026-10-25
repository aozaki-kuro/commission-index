// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountScrollReveal } from './scrollReveal'

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  callback: IntersectionObserverCallback
  observed = new Set<Element>()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed.add(target)
  }

  unobserve(target: Element) {
    this.observed.delete(target)
  }

  disconnect() {
    this.observed.clear()
  }

  fire(target: Element, isIntersecting: boolean) {
    this.callback(
      [
        {
          isIntersecting,
          target,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    )
  }
}

async function flushDomWork() {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  MockIntersectionObserver.instances = []
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('mountScrollReveal', () => {
  it('does not pre-reveal entries inside hidden timeline panels before they become visible', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" class="hidden">
        <div id="timeline-entry" data-commission-entry="true"></div>
      </div>
    `

    const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
    const entry = document.getElementById('timeline-entry') as HTMLElement

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))

    entry.getClientRects = () =>
      panel?.classList.contains('hidden')
        ? ({
            length: 0,
            item() {
              return null
            },
            * [Symbol.iterator]() {},
          } as DOMRectList)
        : ({
            0: new DOMRect(0, 1200, 320, 120),
            length: 1,
            item(index: number) {
              return index === 0 ? new DOMRect(0, 1200, 320, 120) : null
            },
            * [Symbol.iterator]() {
              yield new DOMRect(0, 1200, 320, 120)
            },
          } as DOMRectList)
    entry.getBoundingClientRect = () => new DOMRect(0, 1200, 320, 120)

    const cleanup = mountScrollReveal()

    expect(entry.hasAttribute('data-revealed')).toBe(false)
    expect(MockIntersectionObserver.instances[0]?.observed.has(entry)).toBe(false)

    panel?.classList.remove('hidden')
    await flushDomWork()

    expect(entry.hasAttribute('data-revealed')).toBe(false)
    expect(MockIntersectionObserver.instances[0]?.observed.has(entry)).toBe(true)

    MockIntersectionObserver.instances[0]?.fire(entry, true)
    await flushDomWork()

    expect(entry.hasAttribute('data-revealed')).toBe(true)
    expect(entry.classList.contains('animate-reveal-up')).toBe(true)

    cleanup()
  })

  it('entries inside the hidden archived container are not revealed until shown', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true">
        <div data-archived-sections-container="true" class="hidden">
          <div id="archived-entry" data-commission-entry="true"></div>
        </div>
      </div>
    `

    const container = document.querySelector<HTMLElement>('[data-archived-sections-container="true"]')
    const entry = document.getElementById('archived-entry') as HTMLElement

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))

    const rect = new DOMRect(0, 1200, 320, 120)
    entry.getClientRects = () =>
      container?.classList.contains('hidden')
        ? ({
            length: 0,
            item() {
              return null
            },
            * [Symbol.iterator]() {},
          } as DOMRectList)
        : ({
            0: rect,
            length: 1,
            item(index: number) {
              return index === 0 ? rect : null
            },
            * [Symbol.iterator]() {
              yield rect
            },
          } as DOMRectList)
    entry.getBoundingClientRect = () => rect

    const cleanup = mountScrollReveal()

    expect(entry.hasAttribute('data-revealed')).toBe(false)
    expect(MockIntersectionObserver.instances[0]?.observed.has(entry)).toBe(false)

    container?.classList.remove('hidden')
    await flushDomWork()

    expect(entry.hasAttribute('data-revealed')).toBe(false)
    expect(MockIntersectionObserver.instances[0]?.observed.has(entry)).toBe(true)

    cleanup()
  })
})
