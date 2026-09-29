import { triggerRebuildDeploy } from './adminApi'
import { clearPendingRebuild, getPendingRebuildRevision } from './pendingRebuildSignal'

interface RebuildState {
  status: 'idle' | 'pending' | 'success' | 'error'
  message: string | null
}

const idleState: RebuildState = { status: 'idle', message: null }
const listeners = new Set<() => void>()
let state = idleState
let inFlight: Promise<void> | null = null
let successTimer: ReturnType<typeof setTimeout> | null = null

function publishState(next: RebuildState) {
  if (successTimer !== null) {
    clearTimeout(successTimer)
    successTimer = null
  }
  state = next
  for (const listener of listeners)
    listener()
  if (next.status === 'success')
    successTimer = setTimeout(publishState, 4000, idleState)
}

export function getWebsiteRebuildState() {
  return state
}

export function getServerWebsiteRebuildState() {
  return idleState
}

export function subscribeToWebsiteRebuild(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function dismissWebsiteRebuildNotice() {
  if (state.status !== 'pending')
    publishState(idleState)
}

export function queueWebsiteRebuild(): Promise<void> {
  if (inFlight)
    return inFlight

  // 首页与浮动入口共享在途请求；新保存的修改不属于本次请求快照。
  const revision = getPendingRebuildRevision()
  const request = triggerRebuildDeploy()
    .then(() => {
      clearPendingRebuild(revision)
      publishState({ status: 'success', message: 'Website rebuild queued. Publishing continues in the background.' })
    })
    .catch((error) => {
      publishState({ status: 'error', message: error instanceof Error ? error.message : 'Could not queue the rebuild. Try again.' })
    })
    .finally(() => {
      inFlight = null
    })
  inFlight = request
  publishState({ status: 'pending', message: null })
  return request
}
