// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimelineScrollSpy } from './useTimelineScrollSpy'

const HookProbe = ({ titleIds, enabled = true }: { titleIds: string[]; enabled?: boolean }) => {
  const activeId = useTimelineScrollSpy(titleIds, { enabled })
  return <output data-testid="active-id">{activeId}</output>
}

const createRect = (top: number, height = 40): DOMRect =>
  ({
    top,
    bottom: top + height,
    left: 0,
    right: 200,
    width: 200,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

describe('useTimelineScrollSpy', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
    window.requestAnimationFrame = vi.fn(cb => {
      cb(0)
      return 1
    }) as typeof requestAnimationFrame
    window.cancelAnimationFrame = vi.fn() as typeof cancelAnimationFrame
  })

  it('activates a timeline title at top on direct timeline entry', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" data-commission-view-active="true">
        <h2 id="title-timeline-year-2026"></h2>
      </div>
    `

    const title = document.getElementById('title-timeline-year-2026') as HTMLElement
    vi.spyOn(title, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(createRect(320))

    render(<HookProbe titleIds={['title-timeline-year-2026']} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-timeline-year-2026')
    })
  })

  it('recomputes when timeline panel becomes visible', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" data-commission-view-active="false" class="hidden">
        <h2 id="title-timeline-year-2026"></h2>
      </div>
    `

    const panel = document.querySelector('[data-commission-view-panel="timeline"]') as HTMLElement
    const title = document.getElementById('title-timeline-year-2026') as HTMLElement
    let visible = false

    vi.spyOn(title, 'getClientRects').mockImplementation(
      () =>
        ({
          length: visible ? 1 : 0,
          item: () => null,
          [Symbol.iterator]: function* () {},
        }) as unknown as DOMRectList,
    )
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(createRect(320))

    render(<HookProbe titleIds={['title-timeline-year-2026']} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('')
    })

    visible = true
    panel.setAttribute('data-commission-view-active', 'true')
    panel.classList.remove('hidden')

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-timeline-year-2026')
    })
  })

  it('returns empty when disabled', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" data-commission-view-active="true">
        <h2 id="title-timeline-year-2026"></h2>
      </div>
    `

    const title = document.getElementById('title-timeline-year-2026') as HTMLElement
    vi.spyOn(title, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(createRect(320))

    render(<HookProbe titleIds={['title-timeline-year-2026']} enabled={false} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('')
    })
  })

  it('switches active timeline title when next title crosses viewport midpoint', async () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="timeline" data-commission-view-active="true">
        <h2 id="title-timeline-year-2026"></h2>
        <h2 id="title-timeline-year-2025"></h2>
      </div>
    `

    const current = document.getElementById('title-timeline-year-2026') as HTMLElement
    const next = document.getElementById('title-timeline-year-2025') as HTMLElement

    vi.spyOn(current, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)
    vi.spyOn(next, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)

    let nextTop = 520
    vi.spyOn(current, 'getBoundingClientRect').mockReturnValue(createRect(120))
    vi.spyOn(next, 'getBoundingClientRect').mockImplementation(() => createRect(nextTop))

    render(<HookProbe titleIds={['title-timeline-year-2026', 'title-timeline-year-2025']} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-timeline-year-2026')
    })

    nextTop = 480
    window.dispatchEvent(new Event('scroll'))

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-timeline-year-2025')
    })
  })
})
