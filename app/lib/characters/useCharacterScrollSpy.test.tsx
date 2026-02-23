// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCharacterScrollSpy } from './useCharacterScrollSpy'

const HookProbe = ({ titleIds }: { titleIds: string[] }) => {
  const activeId = useCharacterScrollSpy(titleIds)
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
})
