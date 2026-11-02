// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarDisclosureSlide } from './sidebarDisclosureSlide'

function renderDisclosure() {
  document.body.innerHTML = `
    <div>
      <details>
        <summary>Language</summary>
        <div data-sidebar-disclosure-clip><ul><li>English</li></ul></div>
      </details>
      <div data-follower>View toggles</div>
    </div>
  `
  return {
    details: document.querySelector('details')!,
    summary: document.querySelector('summary')!,
    follower: document.querySelector<HTMLElement>('[data-follower]')!,
  }
}

describe('mountSidebarDisclosureSlide', () => {
  let pending: Array<() => void>
  let animated: Element[]

  beforeEach(() => {
    pending = []
    animated = []
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal('CSS', {
      supports: () => true,
    })
  })

  const stubAnimate = (root: ParentNode) => {
    root.querySelectorAll('*').forEach((node) => {
      ;(node as HTMLElement).animate = function (this: Element) {
        animated.push(this)
        const finished = new Promise<void>(resolve => pending.push(resolve))
        return {
          finished,
          cancel: vi.fn(),
        } as unknown as Animation
      }
    })
  }

  it('flips open at once and keeps a closing list rendered until its slide settles', async () => {
    const { details, summary, follower } = renderDisclosure()
    stubAnimate(document.body)
    const slide = mountSidebarDisclosureSlide(details)

    summary.click()
    expect(details.open).toBe(true)
    expect(animated).toContain(follower)
    pending.splice(0).forEach(resolve => resolve())

    summary.click()
    expect(details.open).toBe(false)
    expect(details.hasAttribute('data-closing')).toBe(true)
    pending.splice(0).forEach(resolve => resolve())
    await vi.waitFor(() => expect(details.hasAttribute('data-closing')).toBe(false))

    slide.dispose()
  })

  it('settles a running close before the next toggle', () => {
    const { details, summary } = renderDisclosure()
    details.open = true
    stubAnimate(document.body)
    const slide = mountSidebarDisclosureSlide(details)

    summary.click()
    expect(details.hasAttribute('data-closing')).toBe(true)

    // A click mid-slide settles the running one first, so the next measurement starts from the snapped layout.
    summary.click()
    expect(details.open).toBe(true)
    expect(details.hasAttribute('data-closing')).toBe(false)

    slide.dispose()
  })

  it('toggles without sliding under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { details, summary } = renderDisclosure()
    details.open = true
    stubAnimate(document.body)
    const slide = mountSidebarDisclosureSlide(details)

    summary.click()
    expect(details.open).toBe(false)
    expect(details.hasAttribute('data-closing')).toBe(false)
    expect(animated).toHaveLength(0)

    slide.dispose()
  })
})
