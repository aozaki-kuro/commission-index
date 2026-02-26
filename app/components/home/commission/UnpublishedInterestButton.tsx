'use client'

import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { useSyncExternalStore } from 'react'
import { COMMISSION_LINK_TEXT_CLASS } from './CreateLinks'

type UnpublishedInterestButtonProps = {
  commissionKey: string
}

const STORAGE_KEY_PREFIX = 'commission-index:unpublished-interest:'
const INTEREST_CHANGED_EVENT = 'unpublished-interest-changed'

const getStorageKey = (commissionKey: string) => `${STORAGE_KEY_PREFIX}${commissionKey}`

const readNotifiedState = (commissionKey: string) => {
  if (typeof window === 'undefined') return false

  try {
    return localStorage.getItem(getStorageKey(commissionKey)) === '1'
  } catch {
    return false
  }
}

const subscribeNotifiedState = (commissionKey: string, callback: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === getStorageKey(commissionKey)) callback()
  }

  const onCustom = (event: Event) => {
    const customEvent = event as CustomEvent<string>
    if (customEvent.detail === commissionKey) callback()
  }

  window.addEventListener('storage', onStorage)
  window.addEventListener(INTEREST_CHANGED_EVENT, onCustom)

  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(INTEREST_CHANGED_EVENT, onCustom)
  }
}

const UnpublishedInterestButton = ({ commissionKey }: UnpublishedInterestButtonProps) => {
  const isNotified = useSyncExternalStore(
    callback => subscribeNotifiedState(commissionKey, callback),
    () => readNotifiedState(commissionKey),
    () => false,
  )

  const handleClick = () => {
    if (isNotified) return

    try {
      localStorage.setItem(getStorageKey(commissionKey), '1')
    } catch {}

    window.dispatchEvent(new CustomEvent<string>(INTEREST_CHANGED_EVENT, { detail: commissionKey }))

    trackRybbitEvent(ANALYTICS_EVENTS.iWantToSeeIt, {
      sub_event: commissionKey,
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isNotified}
      aria-pressed={isNotified}
      data-link-style={isNotified ? undefined : 'true'}
      className={`${COMMISSION_LINK_TEXT_CLASS} cursor-pointer appearance-none border-0 bg-transparent p-0 ${isNotified ? 'text-inherit' : ''}disabled:cursor-default disabled:no-underline`}
      title={isNotified ? 'Already recorded' : 'Record interest in this unpublished commission'}
    >
      {isNotified ? '✔ Notified' : 'Want this'}
    </button>
  )
}

export default UnpublishedInterestButton
