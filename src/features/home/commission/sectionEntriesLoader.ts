import { ACTIVE_CHARACTERS_LOADED_EVENT } from '#features/home/commission/activeCharactersEvent'
import {
  SECTION_ENTRIES_LOADED_EVENT,
  SECTION_ENTRIES_LOAD_REQUEST_EVENT,
} from '#features/home/commission/sectionEntriesEvent'
import {
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'
import { getHashTarget, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
const SECTION_SELECTOR = '[data-character-section="true"]'
const SECTION_TEMPLATE_SELECTOR = 'template[data-section-entries-template="true"]'
const SECTION_CONTAINER_SELECTOR = '[data-section-entries-container="true"]'
const SECTION_SENTINEL_SELECTOR = '[data-section-entries-sentinel="true"]'
const SECTION_PRELOAD_MARGIN_PX = 1200

type SectionEntriesLoaderDeps = {
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
}

type MountSectionEntriesLoaderOptions = {
  win?: Window
  doc?: Document
  deps?: Partial<SectionEntriesLoaderDeps>
}

type WindowWithIntersectionObserver = Window &
  typeof globalThis & {
    IntersectionObserver?: typeof IntersectionObserver
  }

const defaultDeps: SectionEntriesLoaderDeps = {
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
}

const getPendingSections = (doc: Document) =>
  Array.from(
    doc.querySelectorAll<HTMLElement>(
      `${CHARACTER_PANEL_SELECTOR} ${SECTION_SELECTOR}[data-section-entries-loaded="false"]`,
    ),
  )

const mountTemplateContent = (section: HTMLElement) => {
  const template = section.querySelector<HTMLTemplateElement>(SECTION_TEMPLATE_SELECTOR)
  const container = section.querySelector<HTMLElement>(SECTION_CONTAINER_SELECTOR)
  if (!template || !container) return false

  container.replaceChildren(template.content.cloneNode(true))
  return true
}

const loadSectionEntries = ({ win, section }: { win: Window; section: HTMLElement }) => {
  if (section.dataset.sectionEntriesLoaded !== 'false') return false
  if (!mountTemplateContent(section)) return false

  section.dataset.sectionEntriesLoaded = 'true'
  section.querySelector<HTMLTemplateElement>(SECTION_TEMPLATE_SELECTOR)?.remove()
  section.querySelector<HTMLElement>(SECTION_SENTINEL_SELECTOR)?.remove()
  win.dispatchEvent(new Event(SECTION_ENTRIES_LOADED_EVENT))
  return true
}

const getDecodedHashId = (hash: string) => {
  if (!hash.startsWith('#')) return ''

  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return ''
  }
}

const templateContainsHashTarget = (section: HTMLElement, hash: string) => {
  const id = getDecodedHashId(hash)
  if (!id) return false

  const template = section.querySelector<HTMLTemplateElement>(SECTION_TEMPLATE_SELECTOR)
  if (!template) return false

  return templateContentContainsElementId(template.content, id)
}

const shouldLoadForSentinel = (win: Window, sentinel: HTMLElement | null) => {
  if (!sentinel) return false

  const rect = sentinel.getBoundingClientRect()
  return rect.top <= win.innerHeight + SECTION_PRELOAD_MARGIN_PX
}

export const mountSectionEntriesLoader = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountSectionEntriesLoaderOptions = {}) => {
  if (!doc.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)) return () => {}

  const deps = { ...defaultDeps, ...depsOverrides }
  const winWithIntersectionObserver = win as WindowWithIntersectionObserver
  const IntersectionObserverCtor = winWithIntersectionObserver.IntersectionObserver
  let intersectionObserver: IntersectionObserver | null = null

  const stopAutoLoad = () => {
    if (intersectionObserver) {
      intersectionObserver.disconnect()
      intersectionObserver = null
    }

    win.removeEventListener('scroll', syncByViewport)
    win.removeEventListener('resize', syncByViewport)
  }

  const syncObservedSentinels = () => {
    const pendingSections = getPendingSections(doc)
    if (pendingSections.length === 0) {
      stopAutoLoad()
      return
    }

    if (typeof IntersectionObserverCtor === 'function') {
      if (!intersectionObserver) {
        intersectionObserver = new IntersectionObserverCtor(
          entries => {
            let didLoad = false

            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              const sentinel = entry.target
              if (!(sentinel instanceof HTMLElement)) continue
              const section = sentinel.closest<HTMLElement>(SECTION_SELECTOR)
              if (!section) continue
              didLoad = loadSectionEntries({ win, section }) || didLoad
            }

            if (didLoad) {
              syncObservedSentinels()
            }
          },
          { rootMargin: `${SECTION_PRELOAD_MARGIN_PX}px 0px` },
        )
      } else {
        intersectionObserver.disconnect()
      }

      pendingSections.forEach(section => {
        const sentinel = section.querySelector<HTMLElement>(SECTION_SENTINEL_SELECTOR)
        if (sentinel) {
          intersectionObserver?.observe(sentinel)
        }
      })
      return
    }

    win.addEventListener('scroll', syncByViewport, { passive: true })
    win.addEventListener('resize', syncByViewport)
    syncByViewport()
  }

  const syncByViewport = () => {
    let didLoad = false

    getPendingSections(doc).forEach(section => {
      const sentinel = section.querySelector<HTMLElement>(SECTION_SENTINEL_SELECTOR)
      if (!shouldLoadForSentinel(win, sentinel)) return
      didLoad = loadSectionEntries({ win, section }) || didLoad
    })

    if (didLoad) {
      syncObservedSentinels()
    } else if (getPendingSections(doc).length === 0) {
      stopAutoLoad()
    }
  }

  const syncHashTarget = () => {
    const hash = win.location.hash
    if (!hash) return
    if (getHashTarget(hash)) return

    const matchingSection = getPendingSections(doc).find(section =>
      templateContainsHashTarget(section, hash),
    )
    if (!matchingSection) return
    if (!loadSectionEntries({ win, section: matchingSection })) return

    syncObservedSentinels()
    win.requestAnimationFrame(() => {
      deps.scrollToHashWithoutWrite(hash)
    })
  }

  const onLoadRequest = () => {
    let didLoad = false

    getPendingSections(doc).forEach(section => {
      didLoad = loadSectionEntries({ win, section }) || didLoad
    })

    if (didLoad) {
      syncObservedSentinels()
    }
  }

  const onMountedSectionsChanged = () => {
    syncHashTarget()
    syncObservedSentinels()
  }

  win.addEventListener(SECTION_ENTRIES_LOAD_REQUEST_EVENT, onLoadRequest)
  win.addEventListener('hashchange', syncHashTarget)
  win.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onMountedSectionsChanged)
  win.addEventListener(STALE_CHARACTERS_LOADED_EVENT, onMountedSectionsChanged)
  win.addEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncObservedSentinels)

  syncHashTarget()
  syncObservedSentinels()

  return () => {
    stopAutoLoad()
    win.removeEventListener(SECTION_ENTRIES_LOAD_REQUEST_EVENT, onLoadRequest)
    win.removeEventListener('hashchange', syncHashTarget)
    win.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, onMountedSectionsChanged)
    win.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, onMountedSectionsChanged)
    win.removeEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncObservedSentinels)
  }
}
