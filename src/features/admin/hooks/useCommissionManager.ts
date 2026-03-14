import type { CharacterRow, CharacterStatus, CommissionRow } from '#lib/admin/db'
import type { DragOverEvent } from '@dnd-kit/core'
import type { FormState } from '../types'

import { deleteCharacterAction, renameCharacter, saveCharacterOrder } from '#admin/actions'
import {

  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove as dndArrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react'
import { notifyDataUpdate } from '../dataUpdateSignal'

const disclosureStorageKey = 'admin-existing-open'
export const DIVIDER_ID = 'divider'
const EXPIRY_MINUTES = 30
const useSafeLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export type ListItem
  = | { type: 'character', data: CharacterRow }
    | { type: 'divider', id: typeof DIVIDER_ID }

export type CharacterItem = Extract<ListItem, { type: 'character' }>

export type FormFeedback = { type: 'success' | 'error', text: string } | null

type EditingState = { id: number, value: string } | null
type DeletingState = number | null
interface CharacterOrderPayload { active: number[], stale: number[] }

interface StoredOpenState {
  ids: number[]
  timestamp: number
}

interface CharacterOrderSaveQueueOptions {
  onSaved: () => void
  onError: (message: string) => void
  saveOrder: (payload: CharacterOrderPayload) => Promise<FormState>
}

type OpenIdsAction
  = | { type: 'clear' }
    | { type: 'reconcile', validIds: Set<number> }
    | { type: 'toggle', characterId: number }

type CommissionMapAction
  = | { type: 'remove-character', characterId: number }
    | { type: 'remove-commission', characterId: number, commissionId: number }
    | { type: 'replace', value: Map<number, CommissionRow[]> }

type ListAction
  = | { type: 'remove-character', characterId: number }
    | { type: 'rename-character', characterId: number, name: string }
    | { type: 'replace', value: ListItem[] }
    | { type: 'set', value: ListItem[] }

export function createLatestCharacterOrderSaveQueue({
  onSaved,
  onError,
  saveOrder,
}: CharacterOrderSaveQueueOptions) {
  let requestedVersion = 0
  let completedVersion = 0
  let latestPayload: CharacterOrderPayload | null = null
  let runningPromise: Promise<void> | null = null
  let disposed = false

  const runLoop = async () => {
    while (true) {
      if (disposed || completedVersion >= requestedVersion) {
        break
      }
      const targetVersion = requestedVersion
      const payload = latestPayload
      if (!payload)
        break

      try {
        const result = await saveOrder(payload)
        if (!disposed && result.status === 'success' && targetVersion === requestedVersion) {
          onSaved()
        }
        else if (!disposed && result.status === 'error' && targetVersion === requestedVersion) {
          onError(result.message ?? 'Unable to save character order.')
        }
      }
      catch {
        if (!disposed && targetVersion === requestedVersion) {
          onError('Unable to save character order.')
        }
      }

      completedVersion = targetVersion
    }
  }

  const ensureRunning = () => {
    if (runningPromise)
      return

    runningPromise = runLoop().finally(() => {
      runningPromise = null
      if (!disposed && completedVersion < requestedVersion) {
        ensureRunning()
      }
    })
  }

  return {
    enqueue(payload: CharacterOrderPayload) {
      latestPayload = payload
      requestedVersion += 1
      ensureRunning()
    },
    dispose() {
      disposed = true
    },
  }
}

function readOpenIdsFromStorage(): Set<number> {
  if (typeof window === 'undefined')
    return new Set()

  try {
    const stored = window.localStorage.getItem(disclosureStorageKey)
    if (!stored)
      return new Set()

    const parsed = JSON.parse(stored) as
      | StoredOpenState
      | {
        id?: number
        timestamp?: number
      }
    const now = Date.now()
    const expiryTime = EXPIRY_MINUTES * 60 * 1000

    if (!parsed || typeof parsed !== 'object') {
      window.localStorage.removeItem(disclosureStorageKey)
      return new Set()
    }

    const timestamp = Number(parsed.timestamp)
    if (!Number.isFinite(timestamp) || now - timestamp > expiryTime) {
      window.localStorage.removeItem(disclosureStorageKey)
      return new Set()
    }

    if ('ids' in parsed && Array.isArray(parsed.ids)) {
      return new Set(parsed.ids.filter((id): id is number => Number.isInteger(id) && id > 0))
    }

    const legacyId = 'id' in parsed ? parsed.id : undefined
    if (typeof legacyId === 'number' && Number.isInteger(legacyId) && legacyId > 0) {
      return new Set<number>([legacyId])
    }

    return new Set()
  }
  catch {
    return new Set()
  }
}

function saveOpenIdsToStorage(openIds: Set<number>) {
  if (typeof window === 'undefined')
    return

  if (openIds.size === 0) {
    window.localStorage.removeItem(disclosureStorageKey)
    return
  }

  const data: StoredOpenState = {
    ids: [...openIds],
    timestamp: Date.now(),
  }
  window.localStorage.setItem(disclosureStorageKey, JSON.stringify(data))
}

function openIdsReducer(state: Set<number>, action: OpenIdsAction): Set<number> {
  if (action.type === 'clear') {
    return state.size === 0 ? state : new Set()
  }

  if (action.type === 'toggle') {
    const next = new Set(state)
    if (next.has(action.characterId)) {
      next.delete(action.characterId)
    }
    else {
      next.add(action.characterId)
    }
    return next
  }

  const next = new Set([...state].filter(id => action.validIds.has(id)))
  if (next.size === state.size && [...next].every(id => state.has(id))) {
    return state
  }
  return next
}

function commissionMapReducer(
  state: Map<number, CommissionRow[]>,
  action: CommissionMapAction,
): Map<number, CommissionRow[]> {
  if (action.type === 'replace')
    return action.value

  if (action.type === 'remove-character') {
    if (!state.has(action.characterId))
      return state
    const next = new Map(state)
    next.delete(action.characterId)
    return next
  }

  const listForCharacter = state.get(action.characterId) ?? []
  const nextList = listForCharacter.filter(item => item.id !== action.commissionId)
  if (nextList.length === listForCharacter.length)
    return state

  const next = new Map(state)
  next.set(action.characterId, nextList)
  return next
}

function listReducer(state: ListItem[], action: ListAction): ListItem[] {
  if (action.type === 'replace' || action.type === 'set')
    return action.value

  if (action.type === 'remove-character') {
    return state.filter(
      item => !(item.type === 'character' && item.data.id === action.characterId),
    )
  }

  return state.map(item =>
    item.type === 'character' && item.data.id === action.characterId
      ? { ...item, data: { ...item.data, name: action.name } }
      : item)
}

interface UseCommissionManagerParams {
  characters: CharacterRow[]
  commissions: CommissionRow[]
}

function useCommissionManager({ characters, commissions }: UseCommissionManagerParams) {
  const sortedCharacters = useMemo(
    () => characters.toSorted((a, b) => a.sortOrder - b.sortOrder),
    [characters],
  )

  const initialMap = useMemo(() => {
    const grouped = new Map<number, CommissionRow[]>()
    sortedCharacters.forEach(c => grouped.set(c.id, []))
    commissions.forEach((cm) => {
      const list = grouped.get(cm.characterId)
      if (list)
        list.push(cm)
    })
    return grouped
  }, [sortedCharacters, commissions])

  const initialList = useMemo((): ListItem[] => {
    const active = sortedCharacters.filter(c => c.status === 'active')
    const stale = sortedCharacters.filter(c => c.status === 'stale')

    return [
      ...active.map(c => ({ type: 'character' as const, data: c })),
      { type: 'divider' as const, id: DIVIDER_ID },
      ...stale.map(c => ({ type: 'character' as const, data: c })),
    ]
  }, [sortedCharacters])

  const [commissionMap, dispatchCommissionMap] = useReducer(commissionMapReducer, initialMap)
  const [list, dispatchList] = useReducer(listReducer, initialList)
  const [feedback, setFeedback] = useState<FormFeedback>(null)
  const [editing, setEditing] = useState<EditingState>(null)
  const [, startRenameTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<DeletingState>(null)
  const [isDeletePending, startDeleteTransition] = useTransition()
  const [confirmingCharacter, setConfirmingCharacter] = useState<CharacterRow | null>(null)
  const orderSaveQueueRef = useRef<ReturnType<typeof createLatestCharacterOrderSaveQueue> | null>(
    null,
  )

  orderSaveQueueRef.current ??= createLatestCharacterOrderSaveQueue({
    saveOrder: saveCharacterOrder,
    onSaved: notifyDataUpdate,
    onError: (message) => {
      setFeedback({ type: 'error', text: message })
    },
  })

  const closeConfirmDialog = () => setConfirmingCharacter(null)

  const [openIds, dispatchOpenIds] = useReducer(openIdsReducer, undefined, readOpenIdsFromStorage)

  const reconcileOpenIds = useCallback((nextSortedCharacters: CharacterRow[]) => {
    dispatchOpenIds({
      type: 'reconcile',
      validIds: new Set(nextSortedCharacters.map(character => character.id)),
    })
  }, [])

  const replaceCommissionMap = useCallback((nextMap: Map<number, CommissionRow[]>) => {
    dispatchCommissionMap({ type: 'replace', value: nextMap })
  }, [])

  const replaceList = useCallback((nextList: ListItem[]) => {
    dispatchList({ type: 'replace', value: nextList })
  }, [])

  useEffect(() => {
    saveOpenIdsToStorage(openIds)
  }, [openIds])

  useSafeLayoutEffect(() => {
    reconcileOpenIds(sortedCharacters)
  }, [reconcileOpenIds, sortedCharacters])

  useSafeLayoutEffect(() => {
    replaceCommissionMap(initialMap)
  }, [initialMap, replaceCommissionMap])

  useSafeLayoutEffect(() => {
    replaceList(initialList)
  }, [initialList, replaceList])

  useEffect(() => {
    if (!feedback)
      return
    const timer = setTimeout(setFeedback, 2000, null)
    return () => clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    const orderSaveQueue = orderSaveQueueRef.current
    return () => {
      orderSaveQueue?.dispose()
    }
  }, [])

  const handleDeleteCommission = useCallback((characterId: number, commissionId: number) => {
    dispatchCommissionMap({
      type: 'remove-commission',
      characterId,
      commissionId,
    })
  }, [])

  const handleRequestDelete = useCallback((character: CharacterRow) => {
    setConfirmingCharacter(character)
  }, [])

  const toFeedback = useCallback((state: FormState): FormFeedback => {
    return state.status === 'error'
      ? { type: 'error', text: state.message ?? 'Something went wrong.' }
      : { type: 'success', text: state.message ?? 'Saved.' }
  }, [])

  const persistOrder = useCallback((currentList: ListItem[]) => {
    const dividerIndex = currentList.findIndex(i => i.type === 'divider')
    if (dividerIndex === -1)
      return

    const activeIds = currentList
      .slice(0, dividerIndex)
      .filter((i): i is CharacterItem => i.type === 'character')
      .map(i => i.data.id)

    const staleIds = currentList
      .slice(dividerIndex + 1)
      .filter((i): i is CharacterItem => i.type === 'character')
      .map(i => i.data.id)

    orderSaveQueueRef.current?.enqueue({
      active: activeIds,
      stale: staleIds,
    })
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id)
        return

      const activeIdx = list.findIndex(i =>
        i.type === 'character' ? i.data.id === active.id : i.id === active.id,
      )
      const overIdx = list.findIndex(i =>
        i.type === 'character' ? i.data.id === over.id : i.id === over.id,
      )

      if (activeIdx === -1 || overIdx === -1)
        return

      const next = dndArrayMove(list, activeIdx, overIdx)
      dispatchList({ type: 'set', value: next })
    },
    [list],
  )

  const handleDragEnd = useCallback(() => {
    persistOrder(list)
  }, [list, persistOrder])

  const getCharacterStatus = useCallback(
    (characterId: number): CharacterStatus => {
      const dividerIndex = list.findIndex(i => i.type === 'divider')
      const itemIndex = list.findIndex(i => i.type === 'character' && i.data.id === characterId)
      if (dividerIndex === -1 || itemIndex === -1)
        return 'active'
      return itemIndex < dividerIndex ? 'active' : 'stale'
    },
    [list],
  )

  const startEditingName = useCallback((character: CharacterRow) => {
    setEditing({ id: character.id, value: character.name })
  }, [])

  const handleRenameChange = useCallback((value: string) => {
    setEditing(current => (current ? { ...current, value } : current))
  }, [])

  const cancelEditing = useCallback(() => {
    setEditing((current) => {
      if (!current)
        return current
      const item = list.find(i => i.type === 'character' && i.data.id === current.id) as
        | CharacterItem
        | undefined
      return item ? { id: current.id, value: item.data.name } : current
    })
    setEditing(null)
  }, [list])

  const submitRename = useCallback(() => {
    const current = editing
    if (!current)
      return

    const trimmed = current.value.trim()
    if (!trimmed) {
      cancelEditing()
      return
    }

    const item = list.find(i => i.type === 'character' && i.data.id === current.id) as
      | CharacterItem
      | undefined
    if (!item) {
      setEditing(null)
      return
    }

    if (trimmed === item.data.name) {
      setEditing(null)
      return
    }

    const status = getCharacterStatus(current.id)
    setFeedback({ type: 'success', text: 'Updating name…' })
    startRenameTransition(() => {
      renameCharacter({ id: current.id, name: trimmed, status })
        .then((result) => {
          if (result.status === 'error') {
            setFeedback({ type: 'error', text: result.message ?? 'Unable to update character.' })
            cancelEditing()
            return
          }

          dispatchList({
            type: 'rename-character',
            characterId: current.id,
            name: trimmed,
          })

          setFeedback(toFeedback(result))
          setEditing(null)
          notifyDataUpdate()
        })
        .catch(() => {
          setFeedback({ type: 'error', text: 'Unable to update character.' })
          cancelEditing()
        })
    })
  }, [cancelEditing, editing, getCharacterStatus, list, startRenameTransition, toFeedback])

  const performDeleteCharacter = useCallback(
    (character: CharacterRow) => {
      setFeedback({ type: 'success', text: 'Deleting…' })
      setDeletingId(character.id)
      setEditing(current => (current?.id === character.id ? null : current))

      startDeleteTransition(() => {
        deleteCharacterAction(character.id)
          .then((result) => {
            if (result.status === 'error') {
              setFeedback({
                type: 'error',
                text: result.message ?? 'Unable to delete character.',
              })
              return
            }

            dispatchList({ type: 'remove-character', characterId: character.id })
            dispatchCommissionMap({ type: 'remove-character', characterId: character.id })

            setFeedback(toFeedback(result))
            notifyDataUpdate()
          })
          .catch(() => {
            setFeedback({ type: 'error', text: 'Unable to delete character.' })
          })
          .finally(() => {
            setDeletingId(null)
            setConfirmingCharacter(null)
          })
      })
    },
    [startDeleteTransition, toFeedback],
  )

  const orderedCharacters = useMemo(
    () => list.filter((i): i is CharacterItem => i.type === 'character').map(i => i.data),
    [list],
  )

  const itemIds = useMemo(() => list.map(i => (i.type === 'character' ? i.data.id : i.id)), [list])

  const activeCount = useMemo(() => {
    const dividerIndex = list.findIndex(i => i.type === 'divider')
    return dividerIndex === -1 ? 0 : dividerIndex
  }, [list])

  const toggleCharacterOpen = useCallback((characterId: number) => {
    dispatchOpenIds({ type: 'toggle', characterId })
  }, [])

  const closeAllCharacterOpen = useCallback(() => {
    dispatchOpenIds({ type: 'clear' })
  }, [])

  return {
    list,
    commissionMap,
    feedback,
    openIds,
    editing,
    deletingId,
    isDeletePending,
    confirmingCharacter,
    sensors,
    orderedCharacters,
    itemIds,
    activeCount,
    handleDeleteCommission,
    handleRequestDelete,
    closeConfirmDialog,
    handleDragOver,
    handleDragEnd,
    startEditingName,
    handleRenameChange,
    cancelEditing,
    submitRename,
    performDeleteCharacter,
    toggleCharacterOpen,
    closeAllCharacterOpen,
  }
}

export default useCommissionManager
