// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const controllerCleanup = vi.fn()
const initSearchController = vi.fn(() => controllerCleanup)

vi.mock('@features/home/search/commissionSearchController', () => ({
  initSearchController,
}))

const { mountCommissionSearchIsland } = await import('./commissionSearchIsland')

describe('mountCommissionSearchIsland', () => {
  let idleCallbacks: Map<number, () => void>
  let nextIdleId: number
  const requestIdleCallback = vi.fn((callback: () => void) => {
    const id = nextIdleId++
    idleCallbacks.set(id, callback)
    return id
  })
  const cancelIdleCallback = vi.fn((id: number) => {
    idleCallbacks.delete(id)
  })

  beforeEach(() => {
    idleCallbacks = new Map()
    nextIdleId = 1
    requestIdleCallback.mockClear()
    cancelIdleCallback.mockClear()
    initSearchController.mockClear()
    controllerCleanup.mockClear()
    Object.assign(window, { requestIdleCallback, cancelIdleCallback })

    const root = document.createElement('section')
    root.id = 'commission-search'
    root.dataset.locale = 'en'
    document.body.append(root)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    Reflect.deleteProperty(window, 'requestIdleCallback')
    Reflect.deleteProperty(window, 'cancelIdleCallback')
  })

  function runPendingIdleCallbacks() {
    for (const [id, callback] of idleCallbacks) {
      idleCallbacks.delete(id)
      callback()
    }
  }

  it('defers the controller to an idle callback instead of mounting synchronously', async () => {
    mountCommissionSearchIsland()

    expect(requestIdleCallback).toHaveBeenCalledTimes(1)
    expect(initSearchController).not.toHaveBeenCalled()

    runPendingIdleCallbacks()
    await vi.waitFor(() => expect(initSearchController).toHaveBeenCalledTimes(1))
    expect(initSearchController).toHaveBeenCalledWith(document.getElementById('commission-search'))
  })

  it('cancels a pending idle callback on teardown so nothing mounts into a dead DOM', () => {
    const teardown = mountCommissionSearchIsland()

    teardown()

    expect(cancelIdleCallback).toHaveBeenCalledWith(1)
    expect(idleCallbacks.size).toBe(0)
    expect(initSearchController).not.toHaveBeenCalled()
  })

  it('runs the controller cleanup when torn down after mounting', async () => {
    const teardown = mountCommissionSearchIsland()
    runPendingIdleCallbacks()
    await vi.waitFor(() => expect(initSearchController).toHaveBeenCalledTimes(1))

    teardown()

    expect(controllerCleanup).toHaveBeenCalledTimes(1)
  })
})
