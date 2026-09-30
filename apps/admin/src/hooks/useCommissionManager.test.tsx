// @vitest-environment jsdom
import type { CharacterRow } from '@commission-index/domain'
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommissionManager } from './useCommissionManager'

const actions = vi.hoisted(() => ({
  deleteCharacterAction: vi.fn(),
  renameCharacter: vi.fn(),
  saveCharacterOrder: vi.fn(),
}))

vi.mock('../lib/adminActions', () => ({
  deleteCharacterAction: actions.deleteCharacterAction,
  renameCharacter: actions.renameCharacter,
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
  let manager: ReturnType<typeof useCommissionManager>

  function RenameHarness() {
    manager = useCommissionManager({ characters, commissions })
    return createElement('output', null, manager.feedback?.text)
  }

  const editName = async (character: CharacterRow, value: string) => {
    await act(async () => manager.startEditingName(character))
    await act(async () => manager.handleRenameChange(value))
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    actions.saveCharacterOrder.mockReset().mockResolvedValue({ status: 'success' })
    actions.deleteCharacterAction.mockReset()
    actions.renameCharacter.mockReset()
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

  it('applies a delayed rename without closing another character draft', async () => {
    let finish!: (result: { status: 'success', message: string }) => void
    actions.renameCharacter.mockImplementation(() => new Promise(resolve => finish = resolve))
    await act(async () => root.render(createElement(RenameHarness)))
    await editName(characters[0]!, 'First renamed')
    await act(async () => manager.submitRename())
    await editName(characters[1]!, 'Second draft')
    await act(async () => finish({ status: 'success', message: 'First saved' }))
    expect(manager.editing).toEqual({ id: 2, value: 'Second draft' })
    expect(manager.orderedCharacters.find(character => character.id === 1)?.name).toBe('First renamed')
  })

  it('preserves additional typing in the submitted character while its save is pending', async () => {
    let finish!: (result: { status: 'success' }) => void
    actions.renameCharacter.mockImplementation(() => new Promise(resolve => finish = resolve))
    await act(async () => root.render(createElement(RenameHarness)))
    await editName(characters[0]!, 'Submitted name')
    await act(async () => manager.submitRename())
    await act(async () => manager.handleRenameChange('Newer draft'))
    await act(async () => finish({ status: 'success' }))
    expect(manager.editing).toEqual({ id: 1, value: 'Newer draft' })
    expect(manager.orderedCharacters[0]?.name).toBe('Submitted name')
  })

  it('queues a return to the original name while a different name is saving', async () => {
    let finish!: (result: { status: 'success' }) => void
    let finishSecond!: (result: { status: 'success' }) => void
    actions.renameCharacter
      .mockImplementationOnce(() => new Promise(resolve => finish = resolve))
      .mockImplementationOnce(() => new Promise(resolve => finishSecond = resolve))
    await act(async () => root.render(createElement(RenameHarness)))
    await editName(characters[0]!, 'Temporary name')
    await act(async () => manager.submitRename())
    await act(async () => manager.handleRenameChange('First'))
    await act(async () => manager.submitRename())
    expect(manager.editing?.value).toBe('First')
    expect(actions.renameCharacter).toHaveBeenCalledTimes(1)
    await act(async () => finish({ status: 'success' }))
    expect(actions.renameCharacter).toHaveBeenCalledTimes(2)
    expect(actions.renameCharacter).toHaveBeenLastCalledWith({ id: 1, name: 'First', status: 'active' })
    expect(manager.editing?.value).toBe('First')
    await act(async () => finishSecond({ status: 'success' }))
    expect(manager.orderedCharacters.find(character => character.id === 1)?.name).toBe('First')
    expect(manager.editing).toBeNull()
  })

  it('keeps local archive ordering when rename refresh precedes the queued order response', async () => {
    let finishRename!: (result: { status: 'success' }) => void
    let finishOrder!: (result: { status: 'success' }) => void
    const renamedActiveRows = characters.map(character => character.id === 1 ? { ...character, name: 'Renamed' } : character)
    let serverRows = renamedActiveRows
    const refresh = vi.fn(() => root.render(createElement(RefreshHarness, { rows: serverRows })))
    const latestRefresh = vi.fn(() => root.render(createElement(RefreshHarness, { rows: serverRows, onRefresh: latestRefresh })))
    function RefreshHarness({ rows, onRefresh = refresh }: { rows: CharacterRow[], onRefresh?: () => void }) {
      manager = useCommissionManager({ characters: rows, commissions, onDataChanged: onRefresh })
      return createElement('output', null, manager.activeCount)
    }
    actions.renameCharacter.mockImplementationOnce(() => new Promise(resolve => finishRename = resolve))
    actions.saveCharacterOrder.mockImplementationOnce(() => new Promise(resolve => finishOrder = resolve))
    await act(async () => root.render(createElement(RefreshHarness, { rows: characters })))
    await editName(characters[0]!, 'Renamed')
    await act(async () => manager.submitRename())
    await act(async () => manager.handleReorder(0, 2))
    expect(actions.renameCharacter).toHaveBeenCalledWith({ id: 1, name: 'Renamed', status: 'active' })
    expect(actions.saveCharacterOrder).not.toHaveBeenCalled()
    await act(async () => finishRename({ status: 'success' }))
    expect(actions.saveCharacterOrder).toHaveBeenCalledWith({ active: [2], archived: [1] })
    expect(manager.activeCount).toBe(1)
    expect(manager.list.at(-1)).toMatchObject({ type: 'character', data: { id: 1 } })
    expect(refresh).not.toHaveBeenCalled()
    // 模拟来自另一 tab 的旧 bootstrap；可更新名称和计数，但不能撤销本地归档。
    const staleRows = renamedActiveRows.map(character => character.id === 2 ? { ...character, name: 'Second refreshed', commissionCount: 3 } : character)
    await act(async () => root.render(createElement(RefreshHarness, { rows: staleRows, onRefresh: latestRefresh })))
    expect(manager.activeCount).toBe(1)
    expect(manager.orderedCharacters[0]).toMatchObject({ id: 2, name: 'Second refreshed', commissionCount: 3 })
    serverRows = staleRows.map(character => character.id === 1 ? { ...character, status: 'archived', sortOrder: 1 } : { ...character, sortOrder: 0 })
    await act(async () => finishOrder({ status: 'success' }))
    expect(refresh).not.toHaveBeenCalled()
    expect(latestRefresh).toHaveBeenCalledTimes(1)
    expect(manager.activeCount).toBe(1)
    // 请求结束后正常接受外部新顺序，保护不能长期忽略服务端。
    await act(async () => root.render(createElement(RefreshHarness, { rows: characters })))
    expect(manager.activeCount).toBe(2)
  })

  it('refreshes through the latest callback after an order failure without retrying', async () => {
    let finishOrder!: (result: { status: 'success' | 'error' }) => void
    const oldRefresh = vi.fn()
    const latestRefresh = vi.fn()
    function RefreshHarness({ refresh, rows = characters }: { refresh: () => void, rows?: CharacterRow[] }) {
      manager = useCommissionManager({ characters: rows, commissions, onDataChanged: refresh })
      return createElement('output', null, manager.activeCount)
    }
    actions.saveCharacterOrder.mockImplementationOnce(() => new Promise(resolve => finishOrder = resolve))
    await act(async () => root.render(createElement(RefreshHarness, { refresh: oldRefresh })))
    await act(async () => manager.handleReorder(0, 2))
    await act(async () => root.render(createElement(RefreshHarness, { refresh: latestRefresh })))
    await act(async () => finishOrder({ status: 'error' }))
    expect(oldRefresh).not.toHaveBeenCalled()
    expect(latestRefresh).toHaveBeenCalledTimes(1)
    expect(actions.saveCharacterOrder).toHaveBeenCalledTimes(1)
    expect(manager.feedback?.type).toBe('error')
    const rows = characters.map(character => ({ ...character }))
    await act(async () => root.render(createElement(RefreshHarness, { refresh: latestRefresh, rows })))
    expect(manager.activeCount).toBe(2)
  })

  it('retains the current draft on failure and allows an explicit retry', async () => {
    actions.renameCharacter
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ status: 'success' })
    await act(async () => root.render(createElement(RenameHarness)))
    await editName(characters[0]!, 'Retry this name')
    await act(async () => manager.submitRename())
    expect(manager.editing).toEqual({ id: 1, value: 'Retry this name' })
    expect(manager.feedback?.type).toBe('error')
    await act(async () => manager.submitRename())
    expect(actions.renameCharacter).toHaveBeenCalledTimes(2)
    expect(manager.orderedCharacters[0]?.name).toBe('Retry this name')
    expect(manager.editing).toBeNull()
  })

  it('ignores an old rename error while another rename is queued', async () => {
    let finish!: (result: { status: 'error', message: string }) => void
    let finishSecond!: (result: { status: 'success', message: string }) => void
    actions.renameCharacter.mockImplementationOnce(() => new Promise(resolve => finish = resolve))
      .mockImplementationOnce(() => new Promise(resolve => finishSecond = resolve))
    await act(async () => root.render(createElement(RenameHarness)))
    await editName(characters[0]!, 'First submitted')
    await act(async () => manager.submitRename())
    await editName(characters[1]!, 'Second submitted')
    await act(async () => manager.submitRename())
    expect(manager.editing?.value).toBe('Second submitted')
    await editName(characters[1]!, 'New draft')
    await act(async () => finish({ status: 'error', message: 'Old request failed' }))
    expect(manager.editing).toEqual({ id: 2, value: 'New draft' })
    expect(manager.feedback?.text).toBe('Updating name…')
    await act(async () => finishSecond({ status: 'success', message: 'Second saved' }))
    expect(manager.editing).toEqual({ id: 2, value: 'New draft' })
    expect(manager.orderedCharacters.find(character => character.id === 2)?.name).toBe('Second submitted')
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
