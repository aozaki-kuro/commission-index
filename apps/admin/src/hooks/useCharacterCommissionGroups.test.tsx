// @vitest-environment jsdom
import type { AdminCommissionSearchRow, CharacterRow, CommissionRow } from '@commission-index/domain'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCharacterCommissionGroups } from './useCharacterCommissionGroups'

const actions = vi.hoisted(() => ({
  fetchCharacterCommissionsAction: vi.fn(),
}))

vi.mock('../lib/adminActions', () => ({
  fetchCharacterCommissionsAction: actions.fetchCharacterCommissionsAction,
}))

const characters: CharacterRow[] = [
  {
    id: 1,
    name: 'First',
    status: 'active',
    sortOrder: 0,
    commissionCount: 1,
  },
  {
    id: 2,
    name: 'Second',
    status: 'active',
    sortOrder: 1,
    commissionCount: 1,
  },
]
const searchRows: AdminCommissionSearchRow[] = []

function commission(id: number, characterId: number, creatorName: string): CommissionRow {
  return {
    id,
    publicId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    characterId,
    characterName: characters.find(character => character.id === characterId)?.name ?? '',
    fileName: `${id}.jpg`,
    commissionDate: '2026-01-01',
    creatorName,
    workGroupId: null,
    partNumber: null,
    links: [],
    design: null,
    description: null,
    keyword: null,
    hidden: false,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, reject, resolve }
}

describe('useCharacterCommissionGroups', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let groups: ReturnType<typeof useCharacterCommissionGroups>

  function Harness() {
    groups = useCharacterCommissionGroups({ characters, commissionSearchRows: searchRows })
    return null
  }

  beforeEach(async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    actions.fetchCharacterCommissionsAction.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(Harness)))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('lets a forced refresh supersede an in-flight load, and the older caller receives the newer rows', async () => {
    const first = deferred<CommissionRow[]>()
    const second = deferred<CommissionRow[]>()
    actions.fetchCharacterCommissionsAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    let firstResult: Promise<CommissionRow[] | null> | undefined
    let secondResult: Promise<CommissionRow[] | null> | undefined
    act(() => {
      firstResult = groups.loadCharacterCommissions(1)
    })
    act(() => {
      secondResult = groups.loadCharacterCommissions(1, true)
    })

    const fresh = [
      commission(10, 1, 'Fresh'),
    ]
    await act(async () => {
      first.resolve([
        commission(10, 1, 'Stale'),
      ])
      await first.promise
    })
    // The superseded response must not land.
    expect(groups.loadedCommissions).toEqual([])
    expect(groups.loadingCharacterIds.has(1)).toBe(true)

    await act(async () => {
      second.resolve(fresh)
      await secondResult
    })
    await expect(firstResult).resolves.toEqual(fresh)
    expect(groups.loadedCommissions).toEqual(fresh)
    expect(groups.loadedCharacterIds.has(1)).toBe(true)
    expect(groups.isCharacterStale(1)).toBe(false)
    await vi.waitFor(() => expect(groups.loadingCharacterIds.has(1)).toBe(false))
  })

  it('drops a response that lands after a local invalidation and keeps the group stale', async () => {
    const request = deferred<CommissionRow[]>()
    actions.fetchCharacterCommissionsAction.mockReturnValueOnce(request.promise)

    let result: Promise<CommissionRow[] | null> | undefined
    act(() => {
      result = groups.loadCharacterCommissions(2)
    })
    act(() => groups.invalidateCharacterLoad(2))

    await act(async () => {
      request.resolve([
        commission(20, 2, 'Read before the save'),
      ])
      await result
    })
    await expect(result).resolves.toBeNull()
    expect(groups.loadedCommissions).toEqual([])
    expect(groups.loadedCharacterIds.has(2)).toBe(false)
    expect(groups.isCharacterStale(2)).toBe(true)
    await vi.waitFor(() => expect(groups.loadingCharacterIds.has(2)).toBe(false))
  })

  it('keeps a refresh error through a scoped refresh and clears it on a full successful one', async () => {
    actions.fetchCharacterCommissionsAction.mockImplementation(async (characterId: number) => [
      commission(characterId * 10, characterId, 'Saved'),
    ])
    await act(async () => {
      await Promise.all([
        groups.loadCharacterCommissions(1),
        groups.loadCharacterCommissions(2),
      ])
    })

    actions.fetchCharacterCommissionsAction.mockImplementation(async (characterId: number) => {
      if (characterId === 1)
        throw new Error('Network down')
      return [
        commission(characterId * 10, characterId, 'Saved'),
      ]
    })
    act(() => groups.refreshLoadedGroups())
    await vi.waitFor(() => expect(groups.refreshError).toBe('Network down'))

    actions.fetchCharacterCommissionsAction.mockImplementation(async (characterId: number) => [
      commission(characterId * 10, characterId, 'Saved'),
    ])
    act(() => groups.refreshLoadedGroups(new Set([2])))
    await vi.waitFor(() => expect(actions.fetchCharacterCommissionsAction).toHaveBeenCalledTimes(5))
    await vi.waitFor(() => expect(groups.loadingCharacterIds.size).toBe(0))
    expect(groups.refreshError).toBe('Network down')

    act(() => groups.refreshLoadedGroups())
    await vi.waitFor(() => expect(groups.refreshError).toBeNull())
  })
})
