// @vitest-environment jsdom
import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from '@features/home/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountFloatingButtonsAutoHide } from './floatingButtonsAutoHide'

let scrollY = 0
let scrollHeight = 5000

function renderRoots() {
  document.documentElement.removeAttribute('data-age-gate-open')
  document.body.innerHTML = `
    <div data-mobile-hamburger="true" data-mobile-hamburger-mounted="false" data-mobile-hamburger-open="false">
      <button data-mobile-hamburger-toggle="true">Menu</button>
    </div>
    <div data-mobile-language-menu-root="true">
      <details data-mobile-language-menu="true"><summary>Language</summary></details>
    </div>
    <button id="outside">outside</button>
  `
}

const hamburger = () => document.querySelector<HTMLElement>('[data-mobile-hamburger="true"]')!
const languageRoot = () => document.querySelector<HTMLElement>('[data-mobile-language-menu-root="true"]')!
const isHidden = (el: HTMLElement) => el.hasAttribute('data-floating-hidden')

async function scrollTo(y: number) {
  scrollY = y
  window.dispatchEvent(new Event('scroll'))
  // One rAF tick is enough for the throttled handler to run.
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
}

async function settle() {
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
}

describe('floatingButtonsAutoHide', () => {
  beforeEach(() => {
    scrollY = 400
    scrollHeight = 5000
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })
    renderRoots()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('hides both roots after scrolling down and shows them after scrolling up', async () => {
    const dispose = mountFloatingButtonsAutoHide()

    await scrollTo(430)
    await vi.waitFor(() => {
      expect(isHidden(hamburger())).toBe(true)
      expect(isHidden(languageRoot())).toBe(true)
    })

    await scrollTo(410)
    await vi.waitFor(() => {
      expect(isHidden(hamburger())).toBe(false)
      expect(isHidden(languageRoot())).toBe(false)
    })
    dispose()
  })

  it('ignores jitter below the threshold', async () => {
    const dispose = mountFloatingButtonsAutoHide()

    await scrollTo(403)
    await scrollTo(406)
    await scrollTo(404)
    expect(isHidden(hamburger())).toBe(false)
    dispose()
  })

  it('stays shown near the top and near the bottom of the page', async () => {
    scrollY = 0
    const dispose = mountFloatingButtonsAutoHide()

    await scrollTo(10)
    await scrollTo(15)
    expect(isHidden(hamburger())).toBe(false)

    await scrollTo(600)
    await vi.waitFor(() => expect(isHidden(hamburger())).toBe(true))

    await scrollTo(scrollHeight - 800)
    await vi.waitFor(() => expect(isHidden(hamburger())).toBe(false))
    dispose()
  })

  it.each([
    [
      'language menu open',
      () => {
        document.querySelector<HTMLDetailsElement>('[data-mobile-language-menu="true"]')!.open = true
      },
      () => {
        document.querySelector<HTMLDetailsElement>('[data-mobile-language-menu="true"]')!.open = false
      },
    ],
    [
      'hamburger mounted',
      () => {
        hamburger().dataset.mobileHamburgerMounted = 'true'
      },
      () => {
        hamburger().dataset.mobileHamburgerMounted = 'false'
      },
    ],
    [
      'hamburger open',
      () => {
        hamburger().dataset.mobileHamburgerOpen = 'true'
      },
      () => {
        hamburger().dataset.mobileHamburgerOpen = 'false'
      },
    ],
    [
      'keyboard focus inside',
      () => {
        const button = hamburger().querySelector('button')!
        // jsdom's :focus-visible heuristic is unreliable, so pin keyboard-originated focus explicitly.
        vi.spyOn(button, 'matches').mockImplementation(
          selector => selector === ':focus-visible' || Element.prototype.matches.call(button, selector),
        )
        button.focus()
      },
      () => {
        document.querySelector<HTMLElement>('#outside')!.focus()
      },
    ],
    [
      'age gate open',
      () => {
        document.documentElement.dataset.ageGateOpen = 'true'
      },
      () => {
        document.documentElement.removeAttribute('data-age-gate-open')
      },
    ],
  ])('never hides while pinned: %s', async (_name, pin, release) => {
    const dispose = mountFloatingButtonsAutoHide()
    pin()

    // Two frames guarantee the handler ran; a no-op handler would also leave it shown,
    // so the hide after release is the positive control.
    await scrollTo(500)
    await scrollTo(560)
    await settle()
    expect(isHidden(hamburger())).toBe(false)
    expect(isHidden(languageRoot())).toBe(false)

    release()
    await scrollTo(620)
    await scrollTo(680)
    await vi.waitFor(() => {
      expect(isHidden(hamburger())).toBe(true)
      expect(isHidden(languageRoot())).toBe(true)
    })
    dispose()
  })

  it('does not pin on pointer-originated focus inside a root', async () => {
    const dispose = mountFloatingButtonsAutoHide()
    // A tap/click focuses the toggle without :focus-visible. jsdom's :focus-visible is a stateful
    // heuristic that can report true for a plain focus(), so pin the pointer case explicitly.
    const button = hamburger().querySelector('button')!
    vi.spyOn(button, 'matches').mockImplementation(
      selector => selector !== ':focus-visible' && Element.prototype.matches.call(button, selector),
    )
    button.focus()

    await scrollTo(500)
    await scrollTo(560)
    await vi.waitFor(() => {
      expect(isHidden(hamburger())).toBe(true)
      expect(isHidden(languageRoot())).toBe(true)
    })
    dispose()
  })

  it('ignores zero-delta scroll events when accumulating travel', async () => {
    const dispose = mountFloatingButtonsAutoHide()

    await scrollTo(405)
    await scrollTo(405)
    await scrollTo(409)
    await settle()
    expect(isHidden(hamburger())).toBe(true)
    dispose()
  })

  it('shows hidden roots when a menu opens or focus enters them', async () => {
    const dispose = mountFloatingButtonsAutoHide()
    await scrollTo(450)
    await vi.waitFor(() => expect(isHidden(hamburger())).toBe(true))

    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, {
        detail: { mounted: true },
      }),
    )
    expect(isHidden(hamburger())).toBe(false)
    expect(isHidden(languageRoot())).toBe(false)
    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, {
        detail: { mounted: false },
      }),
    )

    await scrollTo(500)
    await scrollTo(560)
    await vi.waitFor(() => expect(isHidden(languageRoot())).toBe(true))
    languageRoot().querySelector('summary')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(isHidden(languageRoot())).toBe(false)
    dispose()
  })

  it('removes listeners on dispose', async () => {
    const dispose = mountFloatingButtonsAutoHide()
    dispose()

    await scrollTo(600)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(isHidden(hamburger())).toBe(false)
  })

  it('cancels a pending frame on dispose', async () => {
    const dispose = mountFloatingButtonsAutoHide()
    scrollY = 600
    window.dispatchEvent(new Event('scroll'))
    dispose()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(isHidden(hamburger())).toBe(false)
  })
})
