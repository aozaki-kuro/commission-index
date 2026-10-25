import { readCommissionViewMode } from '@features/home/commission/viewModeState'

export const ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT = 'home:archived-show-request'
export const ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT = 'home:archived-collapse-request'
export const ARCHIVED_CHARACTERS_COLLAPSED_EVENT = 'home:archived-collapsed'
export const ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT = 'home:archived-state-change'

export const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'
export const ARCHIVED_CONTAINER_SELECTOR = '[data-archived-sections-container="true"]'
const FIRST_ARCHIVED_SECTION_SELECTOR
  = '[data-character-section="true"][data-character-status="archived"]'
const ARCHIVED_VISIBILITY_STORAGE_KEY = 'home:archived-visibility'
const ARCHIVED_VIEWPORT_FOCUS_RATIO = 0.5

export type ArchivedCharactersVisibility = 'visible' | 'hidden'

export interface ArchivedCharactersState {
  visibility: ArchivedCharactersVisibility
}

interface SavedArchivedCharactersVisibility {
  pathname: string
  visibility: ArchivedCharactersVisibility
}

function resolveDocument(doc?: Document) {
  return doc ?? (typeof document !== 'undefined' ? document : null)
}

export function isArchivedCharactersVisible(doc?: Document) {
  const panel = resolveDocument(doc)?.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR)
  return panel?.dataset.archivedVisibility === 'visible'
}

export function dispatchArchivedCharactersStateChange(win: Window, state: ArchivedCharactersState) {
  win.dispatchEvent(
    new CustomEvent<ArchivedCharactersState>(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
      detail: state,
    }),
  )
}

export function requestArchivedCharactersVisibility(win: Window, visibility: ArchivedCharactersVisibility) {
  win.dispatchEvent(
    new Event(
      visibility === 'visible'
        ? ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT
        : ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT,
    ),
  )
}

export function readSavedArchivedCharactersVisibility(win: Window): ArchivedCharactersVisibility | null {
  try {
    const rawState = win.sessionStorage.getItem(ARCHIVED_VISIBILITY_STORAGE_KEY)
    if (!rawState)
      return null

    const parsedState = JSON.parse(rawState) as Partial<SavedArchivedCharactersVisibility>
    if (
      parsedState.pathname !== win.location.pathname
      || (parsedState.visibility !== 'visible' && parsedState.visibility !== 'hidden')
    ) {
      return null
    }

    return parsedState.visibility
  }
  catch {
    return null
  }
}

export function persistArchivedCharactersVisibility(win: Window, visibility: ArchivedCharactersVisibility) {
  try {
    win.sessionStorage.setItem(
      ARCHIVED_VISIBILITY_STORAGE_KEY,
      JSON.stringify({
        pathname: win.location.pathname,
        visibility,
      } satisfies SavedArchivedCharactersVisibility),
    )
  }
  catch {
    // Ignore storage write failures so archived toggling keeps working.
  }
}

export function resolveReloadArchivedCharactersVisibility({
  doc,
  win,
}: {
  doc?: Document
  win?: Window
}): ArchivedCharactersVisibility {
  const resolvedWindow = win ?? (typeof window !== 'undefined' ? window : null)
  const resolvedDocument = resolveDocument(doc)
  if (!resolvedWindow || !resolvedDocument)
    return 'hidden'

  if (readCommissionViewMode(resolvedWindow) !== 'character') {
    return 'hidden'
  }

  if (!isArchivedCharactersVisible(resolvedDocument)) {
    return 'hidden'
  }

  const firstArchivedSection = resolvedDocument.querySelector<HTMLElement>(
    FIRST_ARCHIVED_SECTION_SELECTOR,
  )
  if (!firstArchivedSection) {
    return 'visible'
  }

  const archivedStartY = firstArchivedSection.getBoundingClientRect().top + resolvedWindow.scrollY
  const viewportFocusY
    = resolvedWindow.scrollY + resolvedWindow.innerHeight * ARCHIVED_VIEWPORT_FOCUS_RATIO

  return viewportFocusY >= archivedStartY ? 'visible' : 'hidden'
}

export function persistReloadArchivedCharactersVisibility({
  doc,
  win,
}: {
  doc?: Document
  win: Window
}) {
  persistArchivedCharactersVisibility(win, resolveReloadArchivedCharactersVisibility({ doc, win }))
}

function normalizeTargetId(rawValue: string | null | undefined) {
  if (!rawValue)
    return ''
  const value = rawValue.startsWith('#') ? rawValue.slice(1) : rawValue
  try {
    return decodeURIComponent(value)
  }
  catch {
    return ''
  }
}

export function hasArchivedCharacterTarget(doc: Document, rawSectionId: string | null | undefined) {
  const sectionId = normalizeTargetId(rawSectionId)
  if (!sectionId)
    return false

  // The character panel precedes the timeline panel, so the first id match is the archived copy when one exists.
  return Boolean(doc.getElementById(sectionId)?.closest(ARCHIVED_CONTAINER_SELECTOR))
}
