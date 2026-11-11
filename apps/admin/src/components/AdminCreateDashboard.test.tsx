// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCreateDashboard } from './AdminCreateDashboard'

const actions = vi.hoisted(() => ({
  add: vi.fn(),
}))
vi.mock('../lib/adminActions', () => ({
  addCommissionAction: actions.add,
  addCharacterAction: vi.fn(),
}))

describe('create dashboard data refresh', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const onRetry = vi.fn()
  const render = () => act(async () => root.render(
    <AdminCreateDashboard
      characters={[]}
      commissionSearchRows={[]}
      creatorAliases={[]}
      errorMessage={null}
      isLoading={false}
      hasPayload
      onRetry={onRetry}
    />,
  ))
  const submit = () => act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    actions.add.mockReset()
    onRetry.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await render()
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('reloads its own data once after a saved commission, not after a failed one', async () => {
    actions.add.mockResolvedValueOnce({ status: 'error', message: 'Nope' })
    await submit()
    await vi.waitFor(() => expect(actions.add).toHaveBeenCalledTimes(1))
    expect(onRetry).not.toHaveBeenCalled()

    actions.add.mockResolvedValueOnce({ status: 'success' })
    await submit()
    await vi.waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))

    // A new callback identity while the state is still 'success' must not re-fire it.
    const retry2 = vi.fn()
    await act(async () => root.render(
      <AdminCreateDashboard
        characters={[]}
        commissionSearchRows={[]}
        creatorAliases={[]}
        errorMessage={null}
        isLoading={false}
        hasPayload
        onRetry={retry2}
      />,
    ))
    expect(retry2).not.toHaveBeenCalled()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
