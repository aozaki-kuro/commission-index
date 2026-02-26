'use client'

import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { useState } from 'react'
import { COMMISSION_LINK_TEXT_CLASS } from './CreateLinks'

type UnpublishedInterestButtonProps = {
  commissionKey: string
}

const STORAGE_KEY_PREFIX = 'commission-index:unpublished-interest:'

const getStorageKey = (commissionKey: string) => `${STORAGE_KEY_PREFIX}${commissionKey}`

const readNotifiedState = (commissionKey: string) => {
  try {
    return localStorage.getItem(getStorageKey(commissionKey)) === '1'
  } catch {
    return false
  }
}

const UnpublishedInterestButton = ({ commissionKey }: UnpublishedInterestButtonProps) => {
  const [isNotified, setIsNotified] = useState(() => readNotifiedState(commissionKey))

  const handleClick = () => {
    if (isNotified) return

    setIsNotified(true)

    try {
      localStorage.setItem(getStorageKey(commissionKey), '1')
    } catch {}

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
      className={`${COMMISSION_LINK_TEXT_CLASS} cursor-pointer appearance-none border-0 bg-transparent p-0 text-inherit disabled:cursor-default disabled:no-underline`}
      title={isNotified ? 'Already recorded' : 'Record interest in this unpublished commission'}
    >
      {isNotified ? '✔ Notified' : 'Want this'}
    </button>
  )
}

export default UnpublishedInterestButton
