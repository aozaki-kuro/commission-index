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
  let teardownController: (() => void) | undefined

  const cancelIdle = scheduleIdle(() => {
    void import('@features/home/search/commissionSearchController').then(({ initSearchController }) => {
      // Teardown can run while the chunk is still loading; mounting now would target a dead DOM.
      if (disposed)
        return
      const root = document.getElementById('commission-search')
      if (root)
        teardownController = initSearchController(root)
    })
  })

  return () => {
    disposed = true
    cancelIdle()
    teardownController?.()
    teardownController = undefined
  }
}
