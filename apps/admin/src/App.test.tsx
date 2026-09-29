// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, RouteLoadBoundary } from './App'

const lazyCreate = vi.hoisted(() => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
})

vi.mock('./components/FloatingRebuildButton', () => ({ FloatingRebuildButton: () => null }))
vi.mock('./pages/AdminOverviewPage', () => ({ AdminOverviewPage: () => <p>Overview ready</p> }))
vi.mock('./pages/AdminCreatePage', async () => {
  await lazyCreate.promise
  return { AdminCreatePage: () => <p>Create ready</p> }
})
vi.mock('./pages/AdminEditPage', () => ({
  AdminEditPage: ({ onReady }: { onReady?: () => void }) => (
    <button type="button" onClick={onReady}>Finish loading edit groups</button>
  ),
}))

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

  it('慢路由只显示浮动提示，等页面提交或Edit数据就绪后恢复滚动', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    window.history.replaceState(null, '', '/')
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(300)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<App />))
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('Overview ready')
    expect(window.history.scrollRestoration).toBe('auto')

    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/create"]')!.click())
    expect(scrollTo).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Loading page…')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 240))
    })
    const loading = container.querySelector('[data-notice-viewport="page"] [role="status"]')!
    expect(loading.textContent).toBe('Loading page…')
    expect(container.querySelector('section[aria-busy]')).toBeNull()

    await act(async () => lazyCreate.resolve())
    expect(container.textContent).toContain('Create ready')
    expect(window.history.scrollRestoration).toBe('auto')
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: 'auto', top: 0 })
    expect(container.textContent).not.toContain('Loading page…')
    scrollTo.mockClear()

    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/edit"]')!.click())
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(scrollTo).not.toHaveBeenCalled()
    const ready = [...container.querySelectorAll('button')].find(button => button.textContent === 'Finish loading edit groups')!
    expect(window.history.scrollRestoration).toBe('manual')
    await act(async () => ready.click())
    expect(scrollTo).toHaveBeenCalledOnce()
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: 'auto', top: 0 })
    scrollTo.mockClear()

    window.history.replaceState(null, '', '/')
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(container.textContent).toContain('Overview ready')
    expect(window.history.scrollRestoration).toBe('auto')
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: 'auto', top: 300 })
    scrollTo.mockClear()
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/edit"]')!.click())
    await act(async () => window.dispatchEvent(new WheelEvent('wheel')))
    const cancelledReady = [...container.querySelectorAll('button')].find(button => button.textContent === 'Finish loading edit groups')!
    await act(async () => cancelledReady.click())
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
