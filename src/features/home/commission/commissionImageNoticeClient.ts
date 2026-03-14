import type { NoticeState } from './commissionImageNoticeShared'
import { buildNoticeFromContextMenu } from './commissionImageNoticeShared'

const NOTICE_FADE_MS = 180
const NOTICE_HIDE_MS = 2200
const NOTICE_NODE_SELECTOR = '[data-commission-image-notice="true"]'
const NOTICE_BASE_CLASS
  = 'fixed z-50 max-w-84 rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-md transition-opacity duration-180 dark:bg-black/80 dark:text-white dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] dark:ring-white/10'

function findOrCreateNoticeElement(doc: Document) {
  const existing = doc.querySelector<HTMLDivElement>(NOTICE_NODE_SELECTOR)
  if (existing)
    return existing

  const next = doc.createElement('div')
  next.setAttribute('role', 'status')
  next.setAttribute('aria-live', 'polite')
  next.dataset.commissionImageNotice = 'true'
  next.className = `${NOTICE_BASE_CLASS} opacity-0`
  next.style.display = 'none'
  doc.body.appendChild(next)
  return next
}

export function mountCommissionImageNoticeClient(initialNotice: NoticeState | null = null, win: Window = window, doc: Document = document) {
  const noticeElement = findOrCreateNoticeElement(doc)

  let hideTimerId: number | null = null
  let removeTimerId: number | null = null
  let animationFrameId: number | null = null
  let hasVisibleNotice = false

  const clearTimers = () => {
    if (hideTimerId !== null) {
      win.clearTimeout(hideTimerId)
      hideTimerId = null
    }
    if (removeTimerId !== null) {
      win.clearTimeout(removeTimerId)
      removeTimerId = null
    }
    if (animationFrameId !== null) {
      win.cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }

  const closeNotice = () => {
    if (!hasVisibleNotice && noticeElement.style.display === 'none')
      return

    hasVisibleNotice = false
    noticeElement.classList.remove('opacity-100')
    noticeElement.classList.add('opacity-0')

    if (removeTimerId !== null) {
      win.clearTimeout(removeTimerId)
    }
    removeTimerId = win.setTimeout(() => {
      noticeElement.style.display = 'none'
      removeTimerId = null
    }, NOTICE_FADE_MS)
  }

  const openNotice = (notice: NoticeState, scheduleHide: boolean) => {
    clearTimers()

    noticeElement.textContent = notice.text
    noticeElement.style.left = `${notice.left}px`
    noticeElement.style.top = `${notice.top}px`
    noticeElement.style.display = 'block'

    noticeElement.classList.remove('opacity-100')
    noticeElement.classList.add('opacity-0')

    animationFrameId = win.requestAnimationFrame(() => {
      noticeElement.classList.remove('opacity-0')
      noticeElement.classList.add('opacity-100')
      hasVisibleNotice = true
      animationFrameId = null
    })

    if (scheduleHide) {
      hideTimerId = win.setTimeout(() => {
        closeNotice()
        hideTimerId = null
      }, NOTICE_HIDE_MS)
    }
  }

  const onContextMenu = (event: MouseEvent) => {
    const notice = buildNoticeFromContextMenu(event, win)
    if (!notice)
      return
    openNotice(notice, true)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0)
      return
    const target = event.target as Node | null
    if (target && noticeElement.contains(target))
      return
    closeNotice()
  }

  const onScrollOrWheel = () => {
    closeNotice()
  }

  doc.addEventListener('contextmenu', onContextMenu)
  win.addEventListener('pointerdown', onPointerDown)
  win.addEventListener('wheel', onScrollOrWheel, { passive: true })
  win.addEventListener('scroll', onScrollOrWheel, { passive: true })

  if (initialNotice) {
    openNotice(initialNotice, false)
  }

  return () => {
    doc.removeEventListener('contextmenu', onContextMenu)
    win.removeEventListener('pointerdown', onPointerDown)
    win.removeEventListener('wheel', onScrollOrWheel)
    win.removeEventListener('scroll', onScrollOrWheel)
    clearTimers()
    noticeElement.remove()
  }
}
