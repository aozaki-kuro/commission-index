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
  let pendingScope: string | undefined
  let teardownController: (() => void) | undefined
  let cancelIdle: CancelScheduled | undefined
  let hasLoggedLoadFailure = false
  const keywordList = document.getElementById('search-keyword-list')
  const searchRoot = document.getElementById('commission-search')
  const browsePopover = document.getElementById('search-browse-popover')

  function removeEarlyListeners() {
    keywordList?.removeEventListener('click', onEarlyChipClick)
    searchRoot?.removeEventListener('focusin', onEarlyInteraction)
    searchRoot?.removeEventListener('input', onEarlyInteraction)
    browsePopover?.removeEventListener('beforetoggle', onEarlyInteraction)
    browsePopover?.removeEventListener('click', onEarlyBrowseClick)
  }

  function loadController() {
    if (loading)
      return
    loading = true
    // Rejection handler, not a trailing catch: a throw inside initSearchController is not a load failure, and
    // retrying it would init a half-bound root a second time.
    void importController().then(({ initSearchController }) => {
      removeEarlyListeners()
      // Teardown can run while the chunk is still loading; mounting now would target a dead DOM.
      if (disposed)
        return
      const root = document.getElementById('commission-search')
      if (!root)
        return
      const options = pendingScope !== undefined
        ? { pendingKeyword, pendingScope }
        : { pendingKeyword }
      teardownController = initSearchController(root, options)
    }, (error: unknown) => {
      loading = false
      // A retry triggered by focus/input must not replay a chip tapped before the failure.
      pendingKeyword = undefined
      pendingScope = undefined
      if (disposed)
        return
      if (!hasLoggedLoadFailure) {
        hasLoggedLoadFailure = true
        console.error('[search] controller chunk failed to load', error)
      }
    })
  }

  // Load as soon as the user focuses, types, or opens the browse popover so early input does not wait for idle.
  function onEarlyInteraction() {
    cancelIdle?.()
    loadController()
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
    pendingScope = undefined
    cancelIdle?.()
    loadController()
  }

  function onEarlyBrowseClick(event: MouseEvent) {
    const termEl = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-browse-term]')
      : null
    const term = termEl?.dataset.browseTerm
    if (!term)
      return
    pendingKeyword = term
    pendingScope = termEl.dataset.browseScope
    try {
      browsePopover?.hidePopover?.()
    }
    catch {
      // Ignore environments where Popover API is unavailable or the popover is already closed.
    }
    cancelIdle?.()
    loadController()
  }

  keywordList?.addEventListener('click', onEarlyChipClick)
  searchRoot?.addEventListener('focusin', onEarlyInteraction)
  searchRoot?.addEventListener('input', onEarlyInteraction)
  browsePopover?.addEventListener('beforetoggle', onEarlyInteraction)
  browsePopover?.addEventListener('click', onEarlyBrowseClick)

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
    pendingScope = undefined
    removeEarlyListeners()
    cancelIdle?.()
    teardownController?.()
    teardownController = undefined
  }
}
