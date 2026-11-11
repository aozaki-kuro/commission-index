// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIRMED_AGE_KEY, CONFIRMED_IN_MEMORY_FLAG } from './ageGate'
import { AGE_GATE_STATE_EVENT, mountAgeGate } from './ageGateMount'

vi.mock('@lib/analytics/track', () => ({
  trackRybbitEvent: vi.fn(),
}))

const memoryFlags = window as unknown as Record<string, unknown>

function renderPage() {
  document.body.innerHTML = `
    <div id="shell">
      <main id="main">
        <div data-age-gate-root data-state="closed" class="hidden">
          <div data-age-gate-overlay></div>
          <section data-age-gate-panel>
            <button type="button" data-age-gate-confirm>ok</button>
            <button type="button" data-age-gate-leave>leave</button>
          </section>
        </div>
        <section id="listing"><button type="button">entry</button></section>
        <div id="already-inert" inert></div>
      </main>
      <footer id="footer"></footer>
    </div>
    <div id="body-sibling"></div>
  `
}

const gateRoot = () => document.querySelector<HTMLElement>('[data-age-gate-root]')!
const byId = (id: string) => document.getElementById(id)!
const outsideGate = () => ['listing', 'footer', 'body-sibling'].map(byId)

describe('mountAgeGate', () => {
  let stateEvents: boolean[]

  beforeEach(() => {
    localStorage.clear()
    delete memoryFlags[CONFIRMED_IN_MEMORY_FLAG]
    delete document.documentElement.dataset.ageGateOpen
    delete document.documentElement.dataset.ageGateInitial
    renderPage()
    stateEvents = []
    const onState = (event: Event) => stateEvents.push((event as CustomEvent<{ open: boolean }>).detail.open)
    window.addEventListener(AGE_GATE_STATE_EVENT, onState)
    return () => window.removeEventListener(AGE_GATE_STATE_EVENT, onState)
  })

  it('opens exposed to assistive tech and makes everything outside the gate inert', () => {
    const teardown = mountAgeGate()

    expect(gateRoot().getAttribute('aria-hidden')).toBe('false')
    expect(gateRoot().hasAttribute('inert')).toBe(false)
    expect(byId('main').hasAttribute('inert')).toBe(false)
    for (const element of outsideGate())
      expect(element.hasAttribute('inert')).toBe(true)
    expect(document.documentElement.dataset.ageGateOpen).toBe('true')
    expect(document.activeElement).toBe(document.querySelector('[data-age-gate-confirm]'))
    expect(stateEvents).toEqual([true])
    teardown?.()
  })

  it('confirming hides the gate and releases only the inert it set', () => {
    const teardown = mountAgeGate()

    document.querySelector<HTMLButtonElement>('[data-age-gate-confirm]')!.click()

    expect(gateRoot().getAttribute('aria-hidden')).toBe('true')
    for (const element of outsideGate())
      expect(element.hasAttribute('inert')).toBe(false)
    expect(byId('already-inert').hasAttribute('inert')).toBe(true)
    expect(localStorage.getItem(CONFIRMED_AGE_KEY)).not.toBeNull()
    expect(document.documentElement.dataset.ageGateOpen).toBe('false')
    expect(stateEvents).toEqual([true, false])
    teardown?.()
  })

  it('stays closed and inerts nothing for a stored confirmation', () => {
    localStorage.setItem(CONFIRMED_AGE_KEY, String(Date.now()))
    const teardown = mountAgeGate()

    expect(gateRoot().getAttribute('aria-hidden')).toBe('true')
    for (const element of outsideGate())
      expect(element.hasAttribute('inert')).toBe(false)
    expect(stateEvents).toEqual([false])
    teardown?.()
  })

  it('teardown while open releases the inert page and the html state', () => {
    document.documentElement.dataset.ageGateInitial = 'open'
    const teardown = mountAgeGate()

    teardown?.()

    for (const element of outsideGate())
      expect(element.hasAttribute('inert')).toBe(false)
    expect(byId('already-inert').hasAttribute('inert')).toBe(true)
    expect(document.documentElement.dataset.ageGateOpen).toBeUndefined()
    expect(document.documentElement.dataset.ageGateInitial).toBeUndefined()
  })

  it('remembers a confirmation in memory when storage is blocked, across remounts', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    const teardown = mountAgeGate()
    expect(gateRoot().getAttribute('aria-hidden')).toBe('false')

    document.querySelector<HTMLButtonElement>('[data-age-gate-confirm]')!.click()
    expect(memoryFlags[CONFIRMED_IN_MEMORY_FLAG]).toBe(true)
    expect(byId('listing').hasAttribute('inert')).toBe(false)
    teardown?.()

    renderPage()
    const remountTeardown = mountAgeGate()
    expect(gateRoot().getAttribute('aria-hidden')).toBe('true')
    expect(byId('listing').hasAttribute('inert')).toBe(false)
    remountTeardown?.()
  })
})
