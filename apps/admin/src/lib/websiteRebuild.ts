import { triggerRebuildDeploy } from './adminApi'
import { fetchLiveBuildInfo, isBuildConfirmed } from './liveBuildInfo'
import { clearPendingRebuild, getPendingRebuildRevision } from './pendingRebuildSignal'

interface RebuildState {
  status: 'idle' | 'pending' | 'success' | 'error' | 'unconfirmed'
  message: string | null
}

const idleState: RebuildState = { status: 'idle', message: null }
// The rebuild workflow runs checkout + setup + validate (lint/typecheck/test) + the one-time
// snapshot export + astro check + wrangler build + deploy, then Cloudflare propagates the new
// deployment; a cold run is several minutes. Allow ~10 min before reporting the workflow as
// unconfirmed. Backoff ramps to a 30 s cap so a slow build is not polled too aggressively.
export const websiteRebuildPollTimeoutMs = 600000
const firstPollDelayMs = 5000
const maxPollDelayMs = 30000
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
    .then(async (dispatch) => {
      const deadline = Date.now() + websiteRebuildPollTimeoutMs
      let lastPollError: unknown
      let delay = 0
      while (true) {
        const remaining = deadline - Date.now()
        if (remaining <= 0)
          break
        if (delay > 0)
          await new Promise(resolve => setTimeout(resolve, Math.min(delay, remaining)))
        if (Date.now() >= deadline)
          break
        try {
          const info = await fetchLiveBuildInfo()
          if (isBuildConfirmed(info, dispatch.dispatchedAt)) {
            clearPendingRebuild(revision)
            publishState({ status: 'success', message: 'Website updated and confirmed live.' })
            return
          }
        }
        catch (error) {
          lastPollError = error
        }
        delay = delay === 0 ? firstPollDelayMs : Math.min(delay * 2, maxPollDelayMs)
      }
      const detail = lastPollError instanceof Error ? ` Last check failed: ${lastPollError.message}` : ''
      publishState({ status: 'unconfirmed', message: `Website update not confirmed — check the workflow.${detail}` })
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
