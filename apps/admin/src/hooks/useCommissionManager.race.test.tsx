// @vitest-environment jsdom
import type { CharacterRow } from '@commission-index/domain'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommissionManager } from './useCommissionManager'

const actions = vi.hoisted(() => ({
  renameCharacter: vi.fn(),
  saveCharacterOrder: vi.fn(),
}))

vi.mock('../lib/adminActions', () => ({
  deleteCharacterAction: vi.fn(),
  renameCharacter: actions.renameCharacter,
  saveCharacterOrder: actions.saveCharacterOrder,
}))

const characters: CharacterRow[] = [
  { id: 1, name: 'First', status: 'active', sortOrder: 0, commissionCount: 1 },
  { id: 2, name: 'Second', status: 'active', sortOrder: 1, commissionCount: 0 },
]
const commissions: [] = []

describe('useCommissionManager cross-queue race', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let manager: ReturnType<typeof useCommissionManager>

  function TestHarness() {
    manager = useCommissionManager({ characters, commissions })
    return createElement('output', null, manager.activeCount)
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    actions.saveCharacterOrder.mockReset()
    actions.renameCharacter.mockReset()
    window.localStorage.clear()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('queues rename after reorder to prevent status reversion', async () => {
    let finishRename!: (result: { status: 'success' }) => void
    let finishOrder!: (result: { status: 'success' }) => void

    actions.renameCharacter.mockImplementation(() => new Promise(resolve => finishRename = resolve))
    actions.saveCharacterOrder.mockImplementation(() => new Promise(resolve => finishOrder = resolve))

    await act(async () => root.render(createElement(TestHarness)))

    // Start editing character 1 (currently active)
    await act(async () => manager.startEditingName(characters[0]!))
    await act(async () => manager.handleRenameChange('Renamed First'))

    // Submit rename - this captures status 'active'
    await act(async () => manager.submitRename())

    // Immediately reorder to archive character 1 (move to after divider)
    await act(async () => manager.handleReorder(0, 2))

    // Verify the order of calls: rename should be called first
    expect(actions.renameCharacter).toHaveBeenCalledTimes(1)
    expect(actions.renameCharacter).toHaveBeenCalledWith({
      id: 1,
      name: 'Renamed First',
      status: 'active', // Captured at submission time
    })
    expect(actions.saveCharacterOrder).not.toHaveBeenCalled()

    // Complete rename
    await act(async () => finishRename({ status: 'success' }))

    // Now reorder should be called with the archived status
    expect(actions.saveCharacterOrder).toHaveBeenCalledTimes(1)
    expect(actions.saveCharacterOrder).toHaveBeenCalledWith({
      active: [2],
      archived: [1],
    })

    // Complete reorder
    await act(async () => finishOrder({ status: 'success' }))

    // Verify final state: character 1 should be archived
    expect(manager.activeCount).toBe(1)
  })

  it('reads fresh status for each queued rename submission', async () => {
    let finishFirst!: (result: { status: 'success' }) => void
    let finishOrder!: (result: { status: 'success' }) => void
    let _finishSecond!: (result: { status: 'success' }) => void

    actions.renameCharacter
      .mockImplementationOnce(() => new Promise(resolve => finishFirst = resolve))
      .mockImplementationOnce(() => new Promise(resolve => _finishSecond = resolve))
    actions.saveCharacterOrder.mockImplementation(() => new Promise(resolve => finishOrder = resolve))

    await act(async () => root.render(createElement(TestHarness)))

    // First rename while active
    await act(async () => manager.startEditingName(characters[0]!))
    await act(async () => manager.handleRenameChange('Name A'))
    await act(async () => manager.submitRename())

    expect(actions.renameCharacter).toHaveBeenLastCalledWith({
      id: 1,
      name: 'Name A',
      status: 'active',
    })

    // Complete first rename
    await act(async () => finishFirst({ status: 'success' }))

    // Reorder to archive
    await act(async () => manager.handleReorder(0, 2))
    expect(actions.saveCharacterOrder).toHaveBeenCalledWith({
      active: [2],
      archived: [1],
    })

    // Complete reorder
    await act(async () => finishOrder({ status: 'success' }))

    // Second rename while archived - should read fresh status
    await act(async () => manager.startEditingName(manager.orderedCharacters[1]!))
    await act(async () => manager.handleRenameChange('Name B'))
    await act(async () => manager.submitRename())

    // The second rename should have status 'archived' based on current position
    expect(actions.renameCharacter).toHaveBeenLastCalledWith({
      id: 1,
      name: 'Name B',
      status: 'archived', // Fresh read
    })
  })
})
