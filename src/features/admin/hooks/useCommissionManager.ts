import {
  type DragOverEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove as dndArrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { deleteCharacterAction, renameCharacter, saveCharacterOrder } from '#admin/actions'
import type { CharacterRow, CharacterStatus, CommissionRow } from '#lib/admin/db'

import { notifyDataUpdate } from '../dataUpdateSignal'
import type { FormState } from '../types'

const disclosureStorageKey = 'admin-existing-open'
export const DIVIDER_ID = 'divider'
const EXPIRY_MINUTES = 30

export type ListItem =
  | { type: 'character'; data: CharacterRow }
  | { type: 'divider'; id: typeof DIVIDER_ID }

export type CharacterItem = Extract<ListItem, { type: 'character' }>

export type FormFeedback = { type: 'success' | 'error'; text: string } | null

type EditingState = { id: number; value: string } | null
type DeletingState = number | null
type CharacterOrderPayload = { active: number[]; stale: number[] }

type StoredOpenState = {
  ids: number[]
  timestamp: number
}

type CharacterOrderSaveQueueOptions = {
  onSaved: () => void
  saveOrder: (payload: CharacterOrderPayload) => Promise<FormState>
}

export const createLatestCharacterOrderSaveQueue = ({
  onSaved,
  saveOrder,
}: CharacterOrderSaveQueueOptions) => {
  let requestedVersion = 0
  let completedVersion = 0
  let latestPayload: CharacterOrderPayload | null = null
  let runningPromise: Promise<void> | null = null
  let disposed = false

  const runLoop = async () => {
    while (!disposed && completedVersion < requestedVersion) {
      const targetVersion = requestedVersion
      const payload = latestPayload
      if (!payload) break

      try {
        const result = await saveOrder(payload)
        if (!disposed && result.status === 'success' && targetVersion === requestedVersion) {
          onSaved()
        }
      } catch {
        // Keep drag-sort persistence silent to avoid layout shift in the list UI.
      }

      completedVersion = targetVersion
    }
  }

  const ensureRunning = () => {
    if (runningPromise) return

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

const readOpenIdsFromStorage = (): Set<number> => {
  if (typeof window === 'undefined') return new Set()

  try {
    const stored = window.localStorage.getItem(disclosureStorageKey)
    if (!stored) return new Set()

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
  } catch {
    return new Set()
  }
}

const saveOpenIdsToStorage = (openIds: Set<number>) => {
  if (typeof window === 'undefined') return

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

interface UseCommissionManagerParams {
  characters: CharacterRow[]
  commissions: CommissionRow[]
}

const useCommissionManager = ({ characters, commissions }: UseCommissionManagerParams) => {
  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.sortOrder - b.sortOrder),
    [characters],
  )

  const initialMap = useMemo(() => {
    const grouped = new Map<number, CommissionRow[]>()
    sortedCharacters.forEach(c => grouped.set(c.id, []))
    commissions.forEach(cm => {
      const list = grouped.get(cm.characterId)
      if (list) list.push(cm)
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

  const [commissionMap, setCommissionMap] = useState(initialMap)
  const [list, setList] = useState<ListItem[]>(initialList)
  const [feedback, setFeedback] = useState<FormFeedback>(null)
  const [editing, setEditing] = useState<EditingState>(null)
  const [, startRenameTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<DeletingState>(null)
  const [isDeletePending, startDeleteTransition] = useTransition()
  const [confirmingCharacter, setConfirmingCharacter] = useState<CharacterRow | null>(null)
  const orderSaveQueueRef = useRef<ReturnType<typeof createLatestCharacterOrderSaveQueue> | null>(
    null,
  )

  if (orderSaveQueueRef.current == null) {
    orderSaveQueueRef.current = createLatestCharacterOrderSaveQueue({
      saveOrder: saveCharacterOrder,
      onSaved: notifyDataUpdate,
    })
  }

  const closeConfirmDialog = () => setConfirmingCharacter(null)

  const [openIds, setOpenIds] = useState<Set<number>>(() => readOpenIdsFromStorage())

  useEffect(() => {
    saveOpenIdsToStorage(openIds)
  }, [openIds])

  useEffect(() => {
    const validIds = new Set(sortedCharacters.map(character => character.id))
    setOpenIds(current => {
      const next = new Set([...current].filter(id => validIds.has(id)))
      if (next.size === current.size && [...next].every(id => current.has(id))) {
        return current
      }
      return next
    })
  }, [sortedCharacters])

  useEffect(() => {
    setCommissionMap(initialMap)
  }, [initialMap])

  useEffect(() => {
    setList(initialList)
  }, [initialList])

  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 2000)
    return () => clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    const orderSaveQueue = orderSaveQueueRef.current
    return () => {
      orderSaveQueue?.dispose()
    }
  }, [])

  const handleDeleteCommission = useCallback((characterId: number, commissionId: number) => {
    setCommissionMap(prev => {
      const next = new Map(prev)
      const listForCharacter = next.get(characterId) ?? []
      next.set(
        characterId,
        listForCharacter.filter(item => item.id !== commissionId),
      )
      return next
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
    if (dividerIndex === -1) return

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
      if (!over || active.id === over.id) return

      const activeIdx = list.findIndex(i =>
        i.type === 'character' ? i.data.id === active.id : i.id === active.id,
      )
      const overIdx = list.findIndex(i =>
        i.type === 'character' ? i.data.id === over.id : i.id === over.id,
      )

      if (activeIdx === -1 || overIdx === -1) return

      const next = dndArrayMove(list, activeIdx, overIdx)
      setList(next)
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
      if (dividerIndex === -1 || itemIndex === -1) return 'active'
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
    setEditing(current => {
      if (!current) return current
      const item = list.find(i => i.type === 'character' && i.data.id === current.id) as
        | CharacterItem
        | undefined
      return item ? { id: current.id, value: item.data.name } : current
    })
    setEditing(null)
  }, [list])

  const submitRename = useCallback(() => {
    const current = editing
    if (!current) return

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
        .then(result => {
          if (result.status === 'error') {
            setFeedback({ type: 'error', text: result.message ?? 'Unable to update character.' })
            cancelEditing()
            return
          }

          setList(prev =>
            prev.map(i =>
              i.type === 'character' && i.data.id === current.id
                ? { ...i, data: { ...i.data, name: trimmed } }
                : i,
            ),
          )

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
          .then(result => {
            if (result.status === 'error') {
              setFeedback({
                type: 'error',
                text: result.message ?? 'Unable to delete character.',
              })
              return
            }

            setList(prev =>
              prev.filter(item => !(item.type === 'character' && item.data.id === character.id)),
            )
            setCommissionMap(prev => {
              const next = new Map(prev)
              next.delete(character.id)
              return next
            })

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
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(characterId)) {
        next.delete(characterId)
      } else {
        next.add(characterId)
      }
      return next
    })
  }, [])

  const closeAllCharacterOpen = useCallback(() => {
    setOpenIds(new Set())
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
