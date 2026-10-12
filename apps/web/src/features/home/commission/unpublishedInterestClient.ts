const STORAGE_KEY_PREFIX = 'commission-index:unpublished-interest:'
const BUTTON_SELECTOR = '[data-commission-interest-key]'
const DEFAULT_ICON_SELECTOR = '[data-commission-interest-icon="default"]'
const LABEL_SELECTOR = '[data-commission-interest-label]'
const RECORDED_ICON_SELECTOR = '[data-commission-interest-icon="recorded"]'

interface TrackProperties {
  sub_event: string
}

interface MountUnpublishedInterestButtonsOptions {
  win?: Window
  doc?: Document
  trackEvent?: (properties: TrackProperties) => void
}

const getStorageKey = (commissionKey: string) => `${STORAGE_KEY_PREFIX}${commissionKey}`

function readRecordedState(commissionKey: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined) {
  try {
    return storage?.getItem(getStorageKey(commissionKey)) === '1'
  }
  catch {
    return false
  }
}

function writeRecordedState(commissionKey: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined) {
  try {
    storage?.setItem(getStorageKey(commissionKey), '1')
  }
  catch {}
}

function syncButtonsForKey({
  commissionKey,
  doc,
  recorded,
}: {
  commissionKey: string
  doc: Document
  recorded: boolean
}) {
  const buttons = [...doc.querySelectorAll<HTMLButtonElement>(BUTTON_SELECTOR)].filter(
    button => button.dataset.commissionInterestKey === commissionKey,
  )

  for (const button of buttons) {
    setButtonState(button, recorded)
  }
}

function setButtonState(button: HTMLButtonElement, recorded: boolean) {
  const label = button.querySelector<HTMLSpanElement>(LABEL_SELECTOR)
  if (label) {
    if (!button.dataset.commissionInterestDefaultLabel) {
      button.dataset.commissionInterestDefaultLabel = label.textContent ?? ''
    }

    label.textContent = recorded
      ? (button.dataset.commissionInterestRecordedLabel
        ?? button.dataset.commissionInterestDefaultLabel)
      : button.dataset.commissionInterestDefaultLabel
  }

  button.querySelector<HTMLElement>(DEFAULT_ICON_SELECTOR)?.classList.toggle('hidden', recorded)
  button.querySelector<HTMLElement>(RECORDED_ICON_SELECTOR)?.classList.toggle('hidden', !recorded)

  if (!button.dataset.commissionInterestDefaultTitle) {
    button.dataset.commissionInterestDefaultTitle = button.title
  }

  button.disabled = recorded
  button.setAttribute('aria-pressed', String(recorded))

  if (recorded) {
    button.removeAttribute('data-link-style')
    button.title
      = button.dataset.commissionInterestRecordedTitle
        ?? button.dataset.commissionInterestDefaultTitle
        ?? ''
    return
  }

  button.dataset.linkStyle = 'true'
  button.title = button.dataset.commissionInterestDefaultTitle ?? ''
}

function resolveInterestButton(target: EventTarget | null) {
  if (target instanceof HTMLButtonElement && target.matches(BUTTON_SELECTOR))
    return target
  if (target instanceof Element) {
    return target.closest<HTMLButtonElement>(BUTTON_SELECTOR)
  }
  return null
}

function collectInterestButtons(node: Node) {
  if (node instanceof HTMLButtonElement && node.matches(BUTTON_SELECTOR)) {
    return [node]
  }

  if (node instanceof Element) {
    return [...node.querySelectorAll<HTMLButtonElement>(BUTTON_SELECTOR)]
  }

  return []
}

// Accessing `win.localStorage` throws SecurityError when storage is blocked; fall back to a
// per-page-view memory store so the buttons still work.
function resolveStorage(win: Window): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return win.localStorage
  }
  catch {
    const memory = new Map<string, string>()
    return {
      getItem: key => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
    }
  }
}

export function mountUnpublishedInterestButtons({
  win = window,
  doc = document,
  trackEvent,
}: MountUnpublishedInterestButtonsOptions = {}) {
  const buttons = [...doc.querySelectorAll<HTMLButtonElement>(BUTTON_SELECTOR)]
  const storage = resolveStorage(win)
  const hydratedButtons = new WeakSet<HTMLButtonElement>()

  const hydrateButton = (button: HTMLButtonElement) => {
    const commissionKey = button.dataset.commissionInterestKey
    if (!commissionKey || hydratedButtons.has(button))
      return

    setButtonState(button, readRecordedState(commissionKey, storage))
    hydratedButtons.add(button)
  }

  const handleClick = (event: Event) => {
    const button = resolveInterestButton(event.target)
    if (!button)
      return

    hydrateButton(button)

    const commissionKey = button.dataset.commissionInterestKey
    if (!commissionKey || button.disabled)
      return

    writeRecordedState(commissionKey, storage)
    syncButtonsForKey({ commissionKey, doc, recorded: true })
    trackEvent?.({ sub_event: commissionKey })
  }

  for (const button of buttons) {
    hydrateButton(button)
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        for (const button of collectInterestButtons(node)) {
          hydrateButton(button)
        }
      }
    }
  })

  observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true })
  doc.addEventListener('click', handleClick)

  return () => {
    observer.disconnect()
    doc.removeEventListener('click', handleClick)
  }
}
