// @vitest-environment jsdom
import type { CommissionRow } from '@commission-index/domain'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommissionThumbnailGrid } from './CommissionThumbnailGrid'

const commissions: CommissionRow[] = [1, 2, 3].map(id => ({
  id,
  publicId: `public-${id}`,
  characterId: 1,
  characterName: 'Character',
  commissionDate: '2026-09-29',
  creatorName: 'Creator',
  workGroupId: null,
  partNumber: null,
  fileName: `internal-${id}`,
  links: [],
  hidden: false,
}))

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  callback: IntersectionObserverCallback
  observed = new Set<Element>()
  disconnected = false

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe = (element: Element) => {
    this.observed.add(element)
  }

  unobserve = (element: Element) => {
    this.observed.delete(element)
  }

  disconnect = () => {
    this.disconnected = true
  }

  trigger(isIntersecting: boolean) {
    const entries = [...this.observed].map(target => ({ isIntersecting, target })) as IntersectionObserverEntry[]
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

describe('commission thumbnail grid image loading', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    MockIntersectionObserver.instances = []
  })

  const render = (isExpanded: boolean) => act(async () => root.render(
    <CommissionThumbnailGrid
      commissions={commissions}
      selectedCommissionId={null}
      onSelect={() => {}}
      isExpanded={isExpanded}
    />,
  ))

  const images = () => container.querySelectorAll<HTMLImageElement>('img[src*="/api/admin/commissions/"]')

  it('keeps images absent until first expansion, then preserves them through collapse', async () => {
    await render(false)
    expect(images()).toHaveLength(0)

    await render(true)
    const expanded = [...images()]
    expect(expanded).toHaveLength(3)
    for (const image of expanded) {
      expect(image.getAttribute('width')).toBe('1280')
      expect(image.getAttribute('height')).toBe('525')
      expect(image.getAttribute('loading')).toBe('lazy')
    }

    await render(false)
    expect([...images()]).toEqual(expanded)
    expect(images()).toHaveLength(3)
  })

  it('retries a failed image once before falling back to the placeholder', async () => {
    await render(true)
    const first = images()[0]!

    await act(async () => first.dispatchEvent(new Event('error', { bubbles: true })))
    expect(container.textContent).not.toContain('No image')
    expect(images()).toHaveLength(3)

    await act(async () => images()[0]!.dispatchEvent(new Event('error', { bubbles: true })))
    expect(container.textContent).toContain('No image')
    expect(images()).toHaveLength(2)
  })

  it('defers image fetches until a card nears the viewport', async () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    await render(true)
    expect(MockIntersectionObserver.instances).toHaveLength(3)
    expect(images()).toHaveLength(0)

    await act(async () => MockIntersectionObserver.instances.forEach(instance => instance.trigger(true)))
    expect(images()).toHaveLength(3)
    expect(MockIntersectionObserver.instances.every(instance => instance.disconnected)).toBe(true)
  })
})
