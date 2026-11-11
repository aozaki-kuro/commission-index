// The controller chunk is loaded lazily and mounted in an idle callback so the search UI
// does not compete with first paint. Teardown must cancel the pending callback: a mount that
// fires after the swap would bind to a detached DOM.
type CancelScheduled = () => void

function scheduleIdle(task: () => void): CancelScheduled {
  // Safari lacks requestIdleCallback; the timeout keeps the same deferred contract there.
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(task)
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(task, 1)
  return () => clearTimeout(id)
}

export function mountCommissionSearchIsland(): () => void {
  let disposed = false
  let loading = false
  let pendingKeyword: string | undefined
  let teardownController: (() => void) | undefined
  let cancelIdle: CancelScheduled | undefined
  const keywordList = document.getElementById('search-keyword-list')

  const loadController = () => {
    if (loading)
      return
    loading = true
    void import('@features/home/search/commissionSearchController').then(({ initSearchController }) => {
      keywordList?.removeEventListener('click', onEarlyChipClick)
      // Teardown can run while the chunk is still loading; mounting now would target a dead DOM.
      if (disposed)
        return
      const root = document.getElementById('commission-search')
      if (!root)
        return
      teardownController = initSearchController(root, { pendingKeyword })
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
    cancelIdle?.()
    teardownController?.()
    teardownController = undefined
  }
}
