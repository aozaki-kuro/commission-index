// @vitest-environment jsdom
import type { CharacterRow } from '@commission-index/domain'
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommissionManager } from './useCommissionManager'

const actions = vi.hoisted(() => ({
  deleteCharacterAction: vi.fn(),
  saveCharacterOrder: vi.fn(),
}))

vi.mock('../lib/adminActions', () => ({
  deleteCharacterAction: actions.deleteCharacterAction,
  renameCharacter: vi.fn(),
  saveCharacterOrder: actions.saveCharacterOrder,
}))

const characters: CharacterRow[] = [
  { id: 1, name: 'First', status: 'active', sortOrder: 0, commissionCount: 1 },
  { id: 2, name: 'Second', status: 'active', sortOrder: 1, commissionCount: 0 },
]
const commissions: [] = []

function Harness() {
  const manager = useCommissionManager({ characters, commissions })
  return createElement(
    'div',
    null,
    createElement('button', {
      onClick: () => manager.handleReorder(0, 1),
      type: 'button',
    }, 'Reorder'),
    createElement('button', {
      onClick: () => {
        manager.performDeleteCharacter(characters[0]!)
        manager.performDeleteCharacter(characters[0]!)
      },
      type: 'button',
    }, manager.isDeletePending ? 'Deleting' : 'Delete twice'),
    createElement('output', null, manager.feedback?.text),
  )
}

describe('useCommissionManager request lifecycle', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    actions.saveCharacterOrder.mockReset().mockResolvedValue({ status: 'success' })
    actions.deleteCharacterAction.mockReset()
    window.localStorage.clear()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('preserves stored disclosures until bootstrap data is ready', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1], timestamp: Date.now() }))
    function BootstrapHarness({ ready }: { ready: boolean }) {
      const manager = useCommissionManager({ characters: ready ? characters : [], commissions, isDataReady: ready })
      return createElement('output', null, [...manager.openIds].join(','))
    }
    await act(async () => root.render(createElement(BootstrapHarness, { ready: false })))
    expect(container.textContent).toBe('1')
    expect(JSON.parse(window.localStorage.getItem('admin-existing-open')!).ids).toEqual([1])
    await act(async () => root.render(createElement(BootstrapHarness, { ready: true })))
    expect(container.textContent).toBe('1')
  })

  it('keeps a failed operation visible instead of clearing it on the success timer', async () => {
    vi.useFakeTimers()
    actions.saveCharacterOrder.mockResolvedValue({ status: 'error', message: 'Order was not saved' })
    await act(async () => root.render(createElement(Harness)))
    await act(async () => container.querySelector('button')!.click())
    expect(container.querySelector('output')?.textContent).toBe('Order was not saved')
    await act(async () => vi.advanceTimersByTime(3000))
    expect(container.querySelector('output')?.textContent).toBe('Order was not saved')
  })

  it('recreates its order queue after StrictMode effect replay', async () => {
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Harness)))
    })

    await act(async () => {
      container.querySelector('button')?.click()
      await Promise.resolve()
    })

    expect(actions.saveCharacterOrder).toHaveBeenCalledTimes(1)
    expect(actions.saveCharacterOrder).toHaveBeenCalledWith({ active: [2, 1], archived: [] })
  })

  it('submits one delete while the request is pending', async () => {
    let finishDelete!: (result: { status: 'success', message: string }) => void
    actions.deleteCharacterAction.mockImplementation(() => new Promise((resolve) => {
      finishDelete = resolve
    }))

    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Harness)))
    })

    await act(async () => {
      container.querySelectorAll('button')[1]?.click()
    })

    expect(actions.deleteCharacterAction).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Deleting')

    await act(async () => {
      finishDelete({ status: 'success', message: 'Deleted.' })
      await Promise.resolve()
    })
  })
})
