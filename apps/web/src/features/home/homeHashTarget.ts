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

  const scrollToTarget = (hash: string, target: HTMLElement) => {
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

  const syncHashTarget = () => {
    const hash = win.location.hash
    // getHashTarget resolves shared entry ids to the copy in the active view panel.
    const target = getHashTarget(hash)
    if (target)
      scrollToTarget(hash, target)
  }

  // Re-clicking a link to the current hash fires no hashchange, and the native jump goes to the first id
  // match, which is the hidden character copy in timeline view. Other hashes stay with the native jump.
  const onDocumentClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || !(event.target instanceof Element)
    ) {
      return
    }

    const link = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download'))
      return

    const url = new URL(link.href, win.location.href)
    const { hash, origin, pathname, search } = win.location
    if (!hash || url.hash !== hash || url.origin !== origin || url.pathname !== pathname || url.search !== search)
      return

    const target = getHashTarget(hash)
    if (!target)
      return

    event.preventDefault()
    scrollToTarget(hash, target)
  }

  win.addEventListener('hashchange', syncHashTarget)
  doc.addEventListener('click', onDocumentClick)
  syncHashTarget()

  return () => {
    win.removeEventListener('hashchange', syncHashTarget)
    doc.removeEventListener('click', onDocumentClick)
    if (rafId !== null) {
      win.cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}
