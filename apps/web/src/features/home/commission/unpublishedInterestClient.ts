const STORAGE_KEY_PREFIX = 'commission-index:unpublished-interest:'
const BUTTON_SELECTOR = '[data-commission-interest-key]'
const DEFAULT_ICON_SELECTOR = '[data-commission-interest-icon="default"]'
const LABEL_SELECTOR = '[data-commission-interest-label]'
const RECORDED_ICON_SELECTOR = '[data-commission-interest-icon="recorded"]'

interface TrackProperties {
  // publicId: the stable identity admin joins vote counts on.
  commission: string
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

function markButtonsRecordedForKey(commissionKey: string, doc: Document) {
  const buttons = [
    ...doc.querySelectorAll<HTMLButtonElement>(BUTTON_SELECTOR),
  ].filter(
    button => button.dataset.commissionInterestKey === commissionKey,
  )

  for (const button of buttons) {
    markButtonRecorded(button)
  }
}

// Buttons are server-rendered in their unrecorded state, so only the recorded state is ever applied.
function markButtonRecorded(button: HTMLButtonElement) {
  const label = button.querySelector<HTMLSpanElement>(LABEL_SELECTOR)
  const recordedLabel = button.dataset.commissionInterestRecordedLabel
  if (label && recordedLabel !== undefined) {
    label.textContent = recordedLabel
  }

  button.querySelector<HTMLElement>(DEFAULT_ICON_SELECTOR)?.classList.add('hidden')
  button.querySelector<HTMLElement>(RECORDED_ICON_SELECTOR)?.classList.remove('hidden')

  button.disabled = true
  button.setAttribute('aria-pressed', 'true')
  button.removeAttribute('data-link-style')
  button.title = button.dataset.commissionInterestRecordedTitle ?? button.title
}

function resolveInterestButton(target: EventTarget | null) {
  if (target instanceof HTMLButtonElement && target.matches(BUTTON_SELECTOR))
    return target
  if (target instanceof Element) {
    return target.closest<HTMLButtonElement>(BUTTON_SELECTOR)
  }
  return null
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
  const buttons = [
    ...doc.querySelectorAll<HTMLButtonElement>(BUTTON_SELECTOR),
  ]
  const storage = resolveStorage(win)

  const handleClick = (event: Event) => {
    const button = resolveInterestButton(event.target)
    const commissionKey = button?.dataset.commissionInterestKey
    if (!button || !commissionKey || button.disabled)
      return

    writeRecordedState(commissionKey, storage)
    markButtonsRecordedForKey(commissionKey, doc)
    trackEvent?.({ commission: commissionKey })
  }

  for (const button of buttons) {
    const commissionKey = button.dataset.commissionInterestKey
    if (commissionKey && readRecordedState(commissionKey, storage))
      markButtonRecorded(button)
  }

  doc.addEventListener('click', handleClick)

  return () => {
    doc.removeEventListener('click', handleClick)
  }
}
