// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteLoadBoundary } from './App'

function FailedRoute(): never {
  throw new Error('Chunk unavailable')
}

describe('route load boundary', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    vi.restoreAllMocks()
  })

  it('keeps an in-app recovery action when a route module fails', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root.render(createElement(RouteLoadBoundary, null, createElement(FailedRoute)))
    })

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('This page could not be loaded.')
    expect(container.querySelector('button')?.textContent).toBe('Reload admin')
  })
})
