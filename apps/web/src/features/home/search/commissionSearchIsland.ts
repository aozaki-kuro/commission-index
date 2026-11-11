// The controller chunk is loaded lazily and mounted in an idle callback so the search UI
// does not compete with first paint. Teardown must cancel the pending callback: a mount that
// fires after the swap would bind to a detached DOM.
type CancelScheduled = () => void

// Same fallback delay as the home page's deferred mounts (homePageClient.ts): a 1 ms timeout ran the controller
// chunk right after mount, competing with first paint.
export const SEARCH_ISLAND_IDLE_FALLBACK_DELAY_MS = 180

function scheduleIdle(task: () => void): CancelScheduled {
  // Safari lacks requestIdleCallback; the timeout keeps the same deferred contract there.
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(task)
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(task, SEARCH_ISLAND_IDLE_FALLBACK_DELAY_MS)
  return () => clearTimeout(id)
}

type ControllerModule = Pick<typeof import('@features/home/search/commissionSearchController'), 'initSearchController'>

interface MountCommissionSearchIslandOptions {
  importController?: () => Promise<ControllerModule>
}

const importControllerChunk = () => import('@features/home/search/commissionSearchController')

export function mountCommissionSearchIsland({
  importController = importControllerChunk,
}: MountCommissionSearchIslandOptions = {}): () => void {
  let disposed = false
  let loading = false
  let pendingKeyword: string | undefined
  let teardownController: (() => void) | undefined
  let cancelIdle: CancelScheduled | undefined
  let hasLoggedLoadFailure = false
  const keywordList = document.getElementById('search-keyword-list')
  const searchRoot = document.getElementById('commission-search')

  // A failed load (a tab kept open across a deploy asks for a chunk that is gone) retries on the next interaction:
  // a chip tap through the early listener, which stays bound, or focus moving into the search UI.
  function onRetryInteraction() {
    searchRoot?.removeEventListener('focusin', onRetryInteraction)
    loadController()
  }

  function loadController() {
    if (loading)
      return
    loading = true
    // Rejection handler, not a trailing catch: a throw inside initSearchController is not a load failure, and
    // retrying it would init a half-bound root a second time.
    void importController().then(({ initSearchController }) => {
      keywordList?.removeEventListener('click', onEarlyChipClick)
      // Teardown can run while the chunk is still loading; mounting now would target a dead DOM.
      if (disposed)
        return
      const root = document.getElementById('commission-search')
      if (!root)
        return
      teardownController = initSearchController(root, { pendingKeyword })
    }, (error: unknown) => {
      loading = false
      // A retry triggered by focus must not replay a chip tapped before the failure.
      pendingKeyword = undefined
      if (disposed)
        return
      if (!hasLoggedLoadFailure) {
        hasLoggedLoadFailure = true
        console.error('[search] controller chunk failed to load', error)
      }
      searchRoot?.addEventListener('focusin', onRetryInteraction)
    })
  }

  // The featured chips are server-rendered and visible before the controller exists. A tap in that window is
  // queued and loads the controller at once instead of waiting for idle time.
  function onEarlyChipClick(event: MouseEvent) {
    const chip = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-keyword]')
      : null
    if (!chip?.dataset.keyword)
      return
    pendingKeyword = chip.dataset.keyword
    cancelIdle?.()
    loadController()
  }

  keywordList?.addEventListener('click', onEarlyChipClick)
  // A tap that landed before this mount (the chips paint while the document is still parsing) was stored on the list
  // by the inline script in CommissionSearchIsland.astro.
  const caughtKeyword = keywordList?.dataset.pendingKeyword
  if (caughtKeyword) {
    delete keywordList.dataset.pendingKeyword
    pendingKeyword = caughtKeyword
    loadController()
  }
  else {
    cancelIdle = scheduleIdle(loadController)
  }

  return () => {
    disposed = true
    pendingKeyword = undefined
    keywordList?.removeEventListener('click', onEarlyChipClick)
    searchRoot?.removeEventListener('focusin', onRetryInteraction)
    cancelIdle?.()
    teardownController?.()
    teardownController = undefined
  }
}
