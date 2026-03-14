export interface NoticeState {
  left: number
  top: number
  text: string
}

const NOTICE_OFFSET = 14
const NOTICE_MIN_OFFSET = 12
const NOTICE_WIDTH = 356
const NOTICE_HEIGHT = 120
const IMAGE_CONTAINER_SELECTOR = '[data-commission-image="true"]'

export function buildNoticeFromContextMenu(event: MouseEvent, win: Window): NoticeState | null {
  const target = event.target
  if (!(target instanceof Element))
    return null

  const trigger = target.closest<HTMLElement>(IMAGE_CONTAINER_SELECTOR)
  if (!trigger)
    return null

  const altText = trigger.dataset.commissionAlt?.trim()
  if (!altText)
    return null

  event.preventDefault()
  const left = Math.min(
    event.clientX + NOTICE_OFFSET,
    Math.max(NOTICE_MIN_OFFSET, win.innerWidth - NOTICE_WIDTH),
  )
  const top = Math.min(
    event.clientY + NOTICE_OFFSET,
    Math.max(NOTICE_MIN_OFFSET, win.innerHeight - NOTICE_HEIGHT),
  )

  return { left, top, text: altText }
}
