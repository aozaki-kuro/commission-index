const STORAGE_KEY_PREFIX = 'commission-index:unpublished-interest:'
const BUTTON_SELECTOR = '[data-commission-interest-key]'
const LABEL_SELECTOR = '[data-commission-interest-label]'

type TrackProperties = {
  sub_event: string
}

type MountUnpublishedInterestButtonsOptions = {
  win?: Window
  doc?: Document
  trackEvent?: (properties: TrackProperties) => void
}

const getStorageKey = (commissionKey: string) => `${STORAGE_KEY_PREFIX}${commissionKey}`

const readRecordedState = (commissionKey: string, storage: Storage | undefined) => {
  try {
    return storage?.getItem(getStorageKey(commissionKey)) === '1'
  } catch {
    return false
  }
}

const writeRecordedState = (commissionKey: string, storage: Storage | undefined) => {
  try {
    storage?.setItem(getStorageKey(commissionKey), '1')
  } catch {}
}

const setButtonState = (button: HTMLButtonElement, recorded: boolean) => {
  const label = button.querySelector<HTMLSpanElement>(LABEL_SELECTOR)
  if (label) {
    if (!button.dataset.commissionInterestDefaultLabel) {
      button.dataset.commissionInterestDefaultLabel = label.textContent ?? ''
    }

    label.textContent = recorded
      ? (button.dataset.commissionInterestRecordedLabel ??
        button.dataset.commissionInterestDefaultLabel)
      : button.dataset.commissionInterestDefaultLabel
  }

  if (!button.dataset.commissionInterestDefaultTitle) {
    button.dataset.commissionInterestDefaultTitle = button.title
  }

  button.disabled = recorded
  button.setAttribute('aria-pressed', String(recorded))

  if (recorded) {
    button.removeAttribute('data-link-style')
    button.title =
      button.dataset.commissionInterestRecordedTitle ??
      button.dataset.commissionInterestDefaultTitle ??
      ''
    return
  }

  button.dataset.linkStyle = 'true'
  button.title = button.dataset.commissionInterestDefaultTitle ?? ''
}

export const mountUnpublishedInterestButtons = ({
  win = window,
  doc = document,
  trackEvent,
}: MountUnpublishedInterestButtonsOptions = {}) => {
  const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>(BUTTON_SELECTOR))
  const storage = win.localStorage

  const handleClick = (event: Event) => {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement)) return

    const commissionKey = button.dataset.commissionInterestKey
    if (!commissionKey || button.disabled) return

    setButtonState(button, true)
    writeRecordedState(commissionKey, storage)
    trackEvent?.({ sub_event: commissionKey })
  }

  for (const button of buttons) {
    const commissionKey = button.dataset.commissionInterestKey
    if (!commissionKey) continue

    setButtonState(button, readRecordedState(commissionKey, storage))
    button.addEventListener('click', handleClick)
  }

  return () => {
    for (const button of buttons) {
      button.removeEventListener('click', handleClick)
    }
  }
}
