// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { useCharacterScrollSpy } from './useCharacterScrollSpy'

const HookProbe = ({ titleIds, enabled = true }: { titleIds: string[]; enabled?: boolean }) => {
  const activeId = useCharacterScrollSpy(titleIds, { enabled })
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

describe('useCharacterScrollSpy', () => {
  const originalInnerHeight = window.innerHeight
  const originalInnerWidth = window.innerWidth
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 200, writable: true, configurable: true })
    window.requestAnimationFrame = vi.fn(cb => {
      cb(0)
      return 1
    }) as typeof requestAnimationFrame
    window.cancelAnimationFrame = vi.fn() as typeof cancelAnimationFrame
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
  })

  it('falls back to first visible title when none reaches threshold', async () => {
    document.body.innerHTML = `
      <h2 id="title-artoria-pendragon"></h2>
    `

    const title = document.getElementById('title-artoria-pendragon') as HTMLElement
    vi.spyOn(title, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(createRect(320))

    render(<HookProbe titleIds={['title-artoria-pendragon']} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-artoria-pendragon')
    })
  })

  it('recomputes active title when filtered visibility changes', async () => {
    document.body.innerHTML = `
      <h2 id="title-artoria-pendragon"></h2>
      <h2 id="title-nero-claudius"></h2>
    `

    let artoriaVisible = true
    const artoria = document.getElementById('title-artoria-pendragon') as HTMLElement
    const nero = document.getElementById('title-nero-claudius') as HTMLElement

    vi.spyOn(artoria, 'getClientRects').mockImplementation(
      () =>
        ({
          length: artoriaVisible ? 1 : 0,
          item: () => null,
          [Symbol.iterator]: function* () {},
        }) as unknown as DOMRectList,
    )
    vi.spyOn(nero, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)

    vi.spyOn(artoria, 'getBoundingClientRect').mockReturnValue(createRect(120))
    vi.spyOn(nero, 'getBoundingClientRect').mockReturnValue(createRect(620))

    render(<HookProbe titleIds={['title-artoria-pendragon', 'title-nero-claudius']} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-artoria-pendragon')
    })

    artoriaVisible = false
    window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-nero-claudius')
    })
  })

  it('keeps an active title at top when a search query is present in the url', async () => {
    document.body.innerHTML = `
      <h2 id="title-l-cia"></h2>
    `

    window.history.replaceState(null, '', '/?q=L*cia+')
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })

    const title = document.getElementById('title-l-cia') as HTMLElement
    vi.spyOn(title, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(createRect(320))

    render(<HookProbe titleIds={['title-l-cia']} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-l-cia')
    })
  })

  it('switches active title when the next title crosses the viewport midpoint', async () => {
    document.body.innerHTML = `
      <h2 id="title-artoria-pendragon"></h2>
      <h2 id="title-nero-claudius"></h2>
    `

    const artoria = document.getElementById('title-artoria-pendragon') as HTMLElement
    const nero = document.getElementById('title-nero-claudius') as HTMLElement

    vi.spyOn(artoria, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)
    vi.spyOn(nero, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)

    let neroTop = 520
    vi.spyOn(artoria, 'getBoundingClientRect').mockReturnValue(createRect(120))
    vi.spyOn(nero, 'getBoundingClientRect').mockImplementation(() => createRect(neroTop))

    render(<HookProbe titleIds={['title-artoria-pendragon', 'title-nero-claudius']} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-artoria-pendragon')
    })

    neroTop = 480
    window.dispatchEvent(new Event('scroll'))

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('title-nero-claudius')
    })
  })

  it('skips activation when disabled', async () => {
    document.body.innerHTML = `
      <h2 id="title-mordred"></h2>
    `

    const title = document.getElementById('title-mordred') as HTMLElement
    vi.spyOn(title, 'getClientRects').mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList)
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(createRect(120))

    render(<HookProbe titleIds={['title-mordred']} enabled={false} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-id')).toHaveTextContent('')
    })
  })
})
