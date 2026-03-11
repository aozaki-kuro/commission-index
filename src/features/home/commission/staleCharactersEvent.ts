export const STALE_CHARACTERS_LOAD_REQUEST_EVENT = 'home:stale-load-request'
export const STALE_CHARACTERS_LOADED_EVENT = 'home:stale-loaded'
export const STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT = 'home:stale-collapse-request'
export const STALE_CHARACTERS_COLLAPSED_EVENT = 'home:stale-collapsed'
export const STALE_CHARACTERS_STATE_CHANGE_EVENT = 'home:stale-state-change'

const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'

export type StaleCharactersVisibility = 'visible' | 'hidden'

export type StaleCharactersState = {
  visibility: StaleCharactersVisibility
  loaded: boolean
}

const HIDDEN_STATE: StaleCharactersState = {
  visibility: 'hidden',
  loaded: false,
}

const resolveVisibility = (panel: HTMLElement | null | undefined): StaleCharactersVisibility => {
  if (panel?.dataset.staleVisibility === 'visible') return 'visible'
  if (panel?.dataset.staleVisibility === 'hidden') return 'hidden'
  return panel?.dataset.staleLoaded === 'true' ? 'visible' : 'hidden'
}

export const readStaleCharactersStateFromPanel = (
  panel: HTMLElement | null | undefined,
): StaleCharactersState => {
  const visibility = resolveVisibility(panel)
  return {
    visibility,
    loaded: visibility === 'visible',
  }
}

export const readStaleCharactersState = (doc?: Document): StaleCharactersState => {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument) return HIDDEN_STATE

  return readStaleCharactersStateFromPanel(
    resolvedDocument.querySelector<HTMLElement>(CHARACTER_PANEL_SELECTOR),
  )
}

export const isStaleCharactersVisible = (doc?: Document) => readStaleCharactersState(doc).loaded

export const writeStaleCharactersState = (
  panel: HTMLElement,
  visibility: StaleCharactersVisibility,
): StaleCharactersState => {
  panel.dataset.staleVisibility = visibility
  panel.dataset.staleLoaded = visibility === 'visible' ? 'true' : 'false'
  return readStaleCharactersStateFromPanel(panel)
}

export const dispatchStaleCharactersStateChange = (win: Window, state: StaleCharactersState) => {
  win.dispatchEvent(
    new CustomEvent<StaleCharactersState>(STALE_CHARACTERS_STATE_CHANGE_EVENT, {
      detail: state,
    }),
  )
}

export const requestStaleCharactersVisibility = (
  win: Window,
  visibility: StaleCharactersVisibility,
) => {
  win.dispatchEvent(
    new Event(
      visibility === 'visible'
        ? STALE_CHARACTERS_LOAD_REQUEST_EVENT
        : STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
    ),
  )
}
