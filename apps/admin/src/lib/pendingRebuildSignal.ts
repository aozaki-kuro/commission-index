const STORAGE_KEY = 'pending-rebuild'

type Listener = (pending: boolean) => void
const listeners = new Set<Listener>()

let pending = typeof sessionStorage !== 'undefined'
  ? sessionStorage.getItem(STORAGE_KEY) === '1'
  : false
let revision = 0

function notify() {
  for (const fn of listeners) {
    fn(pending)
  }
}

export function isPendingRebuild(): boolean {
  return pending
}

export function markPendingRebuild(): void {
  revision += 1
  pending = true
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  }
  catch {}
  notify()
}

export function getPendingRebuildRevision(): number {
  return revision
}

export function clearPendingRebuild(expectedRevision?: number): void {
  if (!pending || (expectedRevision !== undefined && expectedRevision !== revision))
    return
  pending = false
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  }
  catch {}
  notify()
}

export function subscribeToPendingRebuild(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
