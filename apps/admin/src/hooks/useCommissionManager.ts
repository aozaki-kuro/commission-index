import type {
  CharacterRow,
  CharacterStatus,
  CommissionRow,
} from '@commission-index/domain'
import type { FormState } from '../lib/formState'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  deleteCharacterAction,
  renameCharacter,
  saveCharacterOrder,
} from '../lib/adminActions'
import { notifyDataUpdate } from '../lib/dataUpdateSignal'
import { markPendingRebuild } from '../lib/pendingRebuildSignal'
import { arrayMove } from './useNativeDragReorder'

const disclosureStorageKey = 'admin-existing-open'
const expiryMs = 30 * 60 * 1000
const useSafeLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export const DIVIDER_ID = 'divider'

export type ListItem
  = | { data: CharacterRow, type: 'character' }
    | { id: typeof DIVIDER_ID, type: 'divider' }

export type CharacterItem = Extract<ListItem, { type: 'character' }>
export type FormFeedback = { text: string, type: 'success' | 'error' } | null

type EditingState = { id: number, value: string } | null
type DeletingState = number | null

interface StoredOpenState {
  ids: number[]
  timestamp: number
}

interface CharacterOrderPayload {
  active: number[]
  archived: number[]
}

interface CharacterOrderSaveQueueOptions {
  onError: (message: string) => void
  onSaved: () => void
  saveOrder: (payload: CharacterOrderPayload) => Promise<FormState>
}

type OpenIdsAction
  = | { type: 'clear' }
    | { characterId: number, type: 'toggle' }
    | { type: 'reconcile', validIds: Set<number> }

type CommissionMapAction
  = | { characterId: number, type: 'remove-character' }
    | { characterId: number, commissionId: number, type: 'remove-commission' }
    | { type: 'replace', value: Map<number, CommissionRow[]> }

type ListAction
  = | { characterId: number, type: 'remove-character' }
    | { characterId: number, name: string, type: 'rename-character' }
    | { type: 'replace', value: ListItem[], preserveOrder?: boolean }
    | { type: 'set', value: ListItem[] }

export function createLatestCharacterOrderSaveQueue({
  onError,
  onSaved,
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
      if (!payload) {
        break
      }

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
    if (runningPromise) {
      return
    }

    runningPromise = runLoop().finally(() => {
      runningPromise = null
      if (!disposed && completedVersion < requestedVersion) {
        ensureRunning()
      }
    })
  }

  return {
    dispose() {
      disposed = true
    },
    enqueue(payload: CharacterOrderPayload) {
      latestPayload = payload
      requestedVersion += 1
      ensureRunning()
    },
  }
}

function readOpenIdsFromStorage(): Set<number> {
  if (typeof window === 'undefined') {
    return new Set()
  }

  try {
    const stored = window.localStorage.getItem(disclosureStorageKey)
    if (!stored) {
      return new Set()
    }

    const parsed = JSON.parse(stored) as StoredOpenState | { id?: number, timestamp?: number }
    const timestamp = Number(parsed.timestamp)
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > expiryMs) {
      window.localStorage.removeItem(disclosureStorageKey)
      return new Set()
    }

    if ('ids' in parsed && Array.isArray(parsed.ids)) {
      return new Set(parsed.ids.filter((value): value is number => Number.isInteger(value) && value > 0))
    }

    const legacyId = 'id' in parsed ? parsed.id : undefined
    return typeof legacyId === 'number' && legacyId > 0 ? new Set([legacyId]) : new Set()
  }
  catch {
    return new Set()
  }
}

function saveOpenIdsToStorage(openIds: Set<number>) {
  if (typeof window === 'undefined') {
    return
  }

  if (openIds.size === 0) {
    window.localStorage.removeItem(disclosureStorageKey)
    return
  }

  const payload: StoredOpenState = {
    ids: [...openIds],
    timestamp: Date.now(),
  }
  window.localStorage.setItem(disclosureStorageKey, JSON.stringify(payload))
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
  return next.size === state.size && [...next].every(id => state.has(id)) ? state : next
}

function commissionMapReducer(
  state: Map<number, CommissionRow[]>,
  action: CommissionMapAction,
): Map<number, CommissionRow[]> {
  if (action.type === 'replace') {
    return action.value
  }

  if (action.type === 'remove-character') {
    if (!state.has(action.characterId)) {
      return state
    }

    const next = new Map(state)
    next.delete(action.characterId)
    return next
  }

  const current = state.get(action.characterId) ?? []
  const nextRows = current.filter(row => row.id !== action.commissionId)
  if (nextRows.length === current.length) {
    return state
  }

  const next = new Map(state)
  next.set(action.characterId, nextRows)
  return next
}

function mergeCharactersInLocalOrder(current: ListItem[], incoming: ListItem[]): ListItem[] {
  // 写入中的顺序以本地为准，外部快照仍可更新元数据、新增和删除角色。
  const nextCharacters = new Map(incoming.flatMap(item => item.type === 'character' ? [[item.data.id, item] as const] : []))
  const knownIds = new Set(current.flatMap(item => item.type === 'character' ? [item.data.id] : []))
  const merged = current.flatMap<ListItem>((item) => {
    if (item.type === 'divider')
      return [item]
    const replacement = nextCharacters.get(item.data.id)
    return replacement ? [replacement] : []
  })
  const added = incoming.filter((item): item is CharacterItem => item.type === 'character' && !knownIds.has(item.data.id))
  merged.splice(merged.findIndex(item => item.type === 'divider'), 0, ...added.filter(item => item.data.status === 'active'))
  merged.push(...added.filter(item => item.data.status === 'archived'))
  return merged
}

function listReducer(state: ListItem[], action: ListAction): ListItem[] {
  if (action.type === 'replace' || action.type === 'set') {
    if (action.type === 'replace' && action.preserveOrder)
      return mergeCharactersInLocalOrder(state, action.value)
    return action.value
  }

  if (action.type === 'remove-character') {
    return state.filter(
      item => !(item.type === 'character' && item.data.id === action.characterId),
    )
  }

  return state.map(item =>
    item.type === 'character' && item.data.id === action.characterId
      ? { ...item, data: { ...item.data, name: action.name } }
      : item,
  )
}

interface UseCommissionManagerParams {
  characters: CharacterRow[]
  commissions: CommissionRow[]
  isDataReady?: boolean
  onDataChanged?: () => void
}

export function useCommissionManager({
  characters,
  commissions,
  isDataReady = true,
  onDataChanged,
}: UseCommissionManagerParams) {
  const sortedCharacters = useMemo(
    () => characters.toSorted((left, right) => left.sortOrder - right.sortOrder),
    [characters],
  )

  const initialMap = useMemo(() => {
    const grouped = new Map<number, CommissionRow[]>()
    sortedCharacters.forEach(character => grouped.set(character.id, []))
    commissions.forEach((commission) => {
      const rows = grouped.get(commission.characterId)
      if (rows) {
        rows.push(commission)
      }
    })
    return grouped
  }, [commissions, sortedCharacters])

  const initialList = useMemo((): ListItem[] => {
    const active = sortedCharacters.filter(character => character.status === 'active')
    const archived = sortedCharacters.filter(character => character.status === 'archived')

    return [
      ...active.map(character => ({ data: character, type: 'character' as const })),
      { id: DIVIDER_ID, type: 'divider' as const },
      ...archived.map(character => ({ data: character, type: 'character' as const })),
    ]
  }, [sortedCharacters])

  const [commissionMap, dispatchCommissionMap] = useReducer(commissionMapReducer, initialMap)
  const [list, dispatchList] = useReducer(listReducer, initialList)
  const [feedback, setFeedback] = useState<FormFeedback>(null)
  const [editing, setEditing] = useState<EditingState>(null)
  const renameSessionRef = useRef(0)
  const renameRequestsRef = useRef(new Map<number, Promise<FormState>>())
  const characterWritesRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingOrderRef = useRef(false)
  const onDataChangedRef = useRef(onDataChanged)
  const [, startRenameTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<DeletingState>(null)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const [confirmingCharacter, setConfirmingCharacter] = useState<CharacterRow | null>(null)
  const [openIds, dispatchOpenIds] = useReducer(openIdsReducer, undefined, readOpenIdsFromStorage)
  const orderSaveQueueRef = useRef<ReturnType<typeof createLatestCharacterOrderSaveQueue> | null>(null)
  const deleteRequestIdRef = useRef(0)
  const activeDeleteRequestIdRef = useRef<number | null>(null)

  useSafeLayoutEffect(() => {
    onDataChangedRef.current = onDataChanged
  }, [onDataChanged])

  const enqueueCharacterWrite = useCallback((write: () => Promise<FormState>) => {
    const request = characterWritesRef.current.catch(() => undefined).then(write)
    characterWritesRef.current = request
    return request
  }, [])

  const reconcileOpenIds = useCallback((nextCharacters: CharacterRow[]) => {
    dispatchOpenIds({
      type: 'reconcile',
      validIds: new Set(nextCharacters.map(character => character.id)),
    })
  }, [])

  const replaceCommissionMap = useCallback((nextMap: Map<number, CommissionRow[]>) => {
    dispatchCommissionMap({ type: 'replace', value: nextMap })
  }, [])

  const replaceList = useCallback((nextList: ListItem[]) => {
    dispatchList({ type: 'replace', value: nextList, preserveOrder: pendingOrderRef.current })
  }, [])

  useEffect(() => {
    saveOpenIdsToStorage(openIds)
  }, [openIds])

  useSafeLayoutEffect(() => {
    if (isDataReady) {
      reconcileOpenIds(sortedCharacters)
    }
  }, [isDataReady, reconcileOpenIds, sortedCharacters])

  useSafeLayoutEffect(() => {
    replaceCommissionMap(initialMap)
  }, [initialMap, replaceCommissionMap])

  useSafeLayoutEffect(() => {
    replaceList(initialList)
  }, [initialList, replaceList])

  useEffect(() => {
    if (!feedback || feedback.type === 'error') {
      return
    }

    const timer = window.setTimeout(() => {
      setFeedback(null)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    const orderSaveQueue = createLatestCharacterOrderSaveQueue({
      onError: (message) => {
        pendingOrderRef.current = false
        setFeedback({ text: message, type: 'error' })
        onDataChangedRef.current?.()
      },
      onSaved: () => {
        pendingOrderRef.current = false
        notifyDataUpdate()
        markPendingRebuild()
        onDataChangedRef.current?.()
      },
      saveOrder: payload => enqueueCharacterWrite(() => saveCharacterOrder(payload)),
    })
    orderSaveQueueRef.current = orderSaveQueue

    return () => {
      orderSaveQueue.dispose()
      if (orderSaveQueueRef.current === orderSaveQueue) {
        orderSaveQueueRef.current = null
      }
    }
  }, [enqueueCharacterWrite])

  const handleDeleteCommission = useCallback((characterId: number, commissionId: number) => {
    dispatchCommissionMap({
      characterId,
      commissionId,
      type: 'remove-commission',
    })
  }, [])

  const handleRequestDelete = useCallback((character: CharacterRow) => {
    if (isDeletePending) {
      return
    }
    setConfirmingCharacter(character)
  }, [isDeletePending])

  const toFeedback = useCallback((state: FormState): FormFeedback => {
    return state.status === 'error'
      ? { text: state.message ?? 'Something went wrong.', type: 'error' }
      : { text: state.message ?? 'Saved.', type: 'success' }
  }, [])

  const persistOrder = useCallback((currentList: ListItem[]) => {
    const dividerIndex = currentList.findIndex(item => item.type === 'divider')
    if (dividerIndex === -1) {
      return
    }

    const activeIds = currentList
      .slice(0, dividerIndex)
      .filter((item): item is CharacterItem => item.type === 'character')
      .map(item => item.data.id)

    const archivedIds = currentList
      .slice(dividerIndex + 1)
      .filter((item): item is CharacterItem => item.type === 'character')
      .map(item => item.data.id)

    if (!orderSaveQueueRef.current)
      return
    pendingOrderRef.current = true
    orderSaveQueueRef.current.enqueue({
      active: activeIds,
      archived: archivedIds,
    })
  }, [])

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    const nextList = arrayMove(list, fromIndex, toIndex)
    dispatchList({ type: 'set', value: nextList })
    persistOrder(nextList)
  }, [list, persistOrder])

  const getCharacterStatus = useCallback((characterId: number): CharacterStatus => {
    const dividerIndex = list.findIndex(item => item.type === 'divider')
    const itemIndex = list.findIndex(
      item => item.type === 'character' && item.data.id === characterId,
    )

    if (dividerIndex === -1 || itemIndex === -1) {
      return 'active'
    }

    return itemIndex < dividerIndex ? 'active' : 'archived'
  }, [list])

  const startEditingName = useCallback((character: CharacterRow) => {
    renameSessionRef.current += 1
    setEditing({
      id: character.id,
      value: character.name,
    })
  }, [])

  const handleRenameChange = useCallback((value: string) => {
    renameSessionRef.current += 1
    setEditing(current => (current ? { ...current, value } : current))
  }, [])

  const cancelEditing = useCallback(() => {
    renameSessionRef.current += 1
    setEditing(null)
  }, [])

  const submitRename = useCallback(() => {
    const current = editing
    if (!current) {
      return
    }

    const trimmed = current.value.trim()
    if (!trimmed) {
      cancelEditing()
      return
    }

    const item = list.find(
      entry => entry.type === 'character' && entry.data.id === current.id,
    ) as CharacterItem | undefined
    if (!item) {
      setEditing(null)
      return
    }

    if (trimmed === item.data.name && !renameRequestsRef.current.has(current.id)) {
      setEditing(null)
      return
    }

    const status = getCharacterStatus(current.id)
    const submittedSession = ++renameSessionRef.current
    const finishEditing = (nextFeedback: FormFeedback, close = false) => {
      // 响应只结束原提交会话，后续角色选择和草稿修改拥有独立生命周期。
      if (renameSessionRef.current !== submittedSession)
        return
      renameSessionRef.current += 1
      setFeedback(nextFeedback)
      if (close)
        setEditing(latest => latest === current ? null : latest)
    }
    setFeedback({ text: 'Updating name…', type: 'success' })

    startRenameTransition(() => {
      // 改名也提交 status，必须与排序写入串行，防止旧状态覆盖后续归档操作。
      const request = enqueueCharacterWrite(() => renameCharacter({
        id: current.id,
        name: trimmed,
        status,
      }))
      renameRequestsRef.current.set(current.id, request)
      request
        .then((result) => {
          if (result.status === 'error') {
            finishEditing({ text: result.message ?? 'Unable to update character.', type: 'error' })
            return
          }

          dispatchList({
            characterId: current.id,
            name: trimmed,
            type: 'rename-character',
          })
          finishEditing(toFeedback(result), true)
          notifyDataUpdate()
          markPendingRebuild()
          if (!pendingOrderRef.current)
            onDataChangedRef.current?.()
        })
        .catch(() => {
          finishEditing({ text: 'Unable to update character.', type: 'error' })
        })
        .finally(() => {
          if (renameRequestsRef.current.get(current.id) === request)
            renameRequestsRef.current.delete(current.id)
        })
    })
  }, [cancelEditing, editing, enqueueCharacterWrite, getCharacterStatus, list, startRenameTransition, toFeedback])

  const performDeleteCharacter = useCallback((character: CharacterRow) => {
    if (activeDeleteRequestIdRef.current !== null || isDeletePending || deletingId !== null) {
      return
    }

    const requestId = ++deleteRequestIdRef.current
    activeDeleteRequestIdRef.current = requestId
    setIsDeletePending(true)
    setFeedback({ text: 'Deleting…', type: 'success' })
    setDeletingId(character.id)
    setEditing(current => (current?.id === character.id ? null : current))

    void deleteCharacterAction(character.id)
      .then((result) => {
        if (result.status === 'error') {
          setFeedback({ text: result.message ?? 'Unable to delete character.', type: 'error' })
          return
        }

        dispatchList({ characterId: character.id, type: 'remove-character' })
        dispatchCommissionMap({ characterId: character.id, type: 'remove-character' })
        setFeedback(toFeedback(result))
        notifyDataUpdate()
        markPendingRebuild()
        onDataChangedRef.current?.()
      })
      .catch(() => {
        setFeedback({ text: 'Unable to delete character.', type: 'error' })
      })
      .finally(() => {
        if (activeDeleteRequestIdRef.current === requestId) {
          activeDeleteRequestIdRef.current = null
          setConfirmingCharacter(null)
          setDeletingId(null)
          setIsDeletePending(false)
        }
      })
  }, [deletingId, isDeletePending, toFeedback])

  const orderedCharacters = useMemo(
    () => list.filter((item): item is CharacterItem => item.type === 'character').map(item => item.data),
    [list],
  )

  const activeCount = useMemo(() => {
    const dividerIndex = list.findIndex(item => item.type === 'divider')
    return dividerIndex === -1 ? 0 : dividerIndex
  }, [list])

  const toggleCharacterOpen = useCallback((characterId: number) => {
    dispatchOpenIds({
      characterId,
      type: 'toggle',
    })
  }, [])

  const closeAllCharacterOpen = useCallback(() => {
    dispatchOpenIds({ type: 'clear' })
  }, [])

  return {
    activeCount,
    cancelEditing,
    closeAllCharacterOpen,
    confirmingCharacter,
    deletingId,
    editing,
    feedback,
    dismissFeedback: () => setFeedback(null),
    handleDeleteCommission,
    handleRenameChange,
    handleReorder,
    handleRequestDelete,
    isDeletePending,
    list,
    openIds,
    orderedCharacters,
    performDeleteCharacter,
    startEditingName,
    submitRename,
    toggleCharacterOpen,
    commissionMap,
    closeConfirmDialog: () => setConfirmingCharacter(null),
  }
}
