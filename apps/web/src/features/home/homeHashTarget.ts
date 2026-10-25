import {
  ARCHIVED_CONTAINER_SELECTOR,
  isArchivedCharactersVisible,
  requestArchivedCharactersVisibility,
} from '@features/home/commission/archivedCharactersState'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '@lib/navigation/hashAnchor'

interface HomeHashTargetDeps {
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
}

const defaultDeps: HomeHashTargetDeps = {
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
}

export function mountHomeHashTarget({
  win = window,
  doc = document,
  deps: depsOverrides,
}: {
  win?: Window
  doc?: Document
  deps?: Partial<HomeHashTargetDeps>
} = {}) {
  const deps = { ...defaultDeps, ...depsOverrides }
  let rafId: number | null = null

  const syncHashTarget = () => {
    const hash = win.location.hash
    // getHashTarget resolves shared entry ids to the copy in the active view panel.
    const target = getHashTarget(hash)
    if (!target)
      return

    if (target.closest(ARCHIVED_CONTAINER_SELECTOR) && !isArchivedCharactersVisible(doc)) {
      // The toggle answers synchronously, so the target is laid out by the next frame.
      requestArchivedCharactersVisibility(win, 'visible')
    }

    if (rafId !== null)
      win.cancelAnimationFrame(rafId)
    rafId = win.requestAnimationFrame(() => {
      rafId = null
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  win.addEventListener('hashchange', syncHashTarget)
  syncHashTarget()

  return () => {
    win.removeEventListener('hashchange', syncHashTarget)
    if (rafId !== null) {
      win.cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}
