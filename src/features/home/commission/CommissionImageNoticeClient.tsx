import { useCallback, useEffect, useRef, useState } from 'react'

type NoticeState = {
  left: number
  top: number
  text: string
}

const NOTICE_FADE_MS = 180
const NOTICE_HIDE_MS = 2200
const NOTICE_OFFSET = 14
const NOTICE_MIN_OFFSET = 12
const NOTICE_WIDTH = 356
const NOTICE_HEIGHT = 120

export default function CommissionImageNoticeClient({
  initialNotice = null,
}: {
  initialNotice?: NoticeState | null
}) {
  const [notice, setNotice] = useState<NoticeState | null>(initialNotice)
  const [isNoticeVisible, setIsNoticeVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    hideTimerRef.current = null
    removeTimerRef.current = null
    animationFrameRef.current = null
  }, [])

  const closeNotice = useCallback(() => {
    if (!noticeRef.current) {
      setNotice(null)
      return
    }

    setIsNoticeVisible(false)
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
    removeTimerRef.current = setTimeout(() => {
      setNotice(null)
      removeTimerRef.current = null
    }, NOTICE_FADE_MS)
  }, [])

  useEffect(() => {
    if (!initialNotice) return
    animationFrameRef.current = requestAnimationFrame(() => {
      setIsNoticeVisible(true)
      animationFrameRef.current = null
    })
  }, [initialNotice])

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const trigger = target.closest<HTMLElement>('[data-commission-image="true"]')
      if (!trigger) return

      const altText = trigger.dataset.commissionAlt?.trim()
      if (!altText) return

      event.preventDefault()
      clearTimers()

      const left = Math.min(
        event.clientX + NOTICE_OFFSET,
        Math.max(NOTICE_MIN_OFFSET, window.innerWidth - NOTICE_WIDTH),
      )
      const top = Math.min(
        event.clientY + NOTICE_OFFSET,
        Math.max(NOTICE_MIN_OFFSET, window.innerHeight - NOTICE_HEIGHT),
      )

      setNotice({ left, top, text: altText })
      setIsNoticeVisible(false)
      animationFrameRef.current = requestAnimationFrame(() => {
        setIsNoticeVisible(true)
        animationFrameRef.current = null
      })

      hideTimerRef.current = setTimeout(() => {
        closeNotice()
        hideTimerRef.current = null
      }, NOTICE_HIDE_MS)
    }

    document.addEventListener('contextmenu', onContextMenu)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [clearTimers, closeNotice])

  useEffect(() => {
    if (!notice) return

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target as Node | null
      if (target && noticeRef.current?.contains(target)) return
      closeNotice()
    }

    const onScrollOrWheel = () => {
      closeNotice()
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('wheel', onScrollOrWheel, { passive: true })
    window.addEventListener('scroll', onScrollOrWheel, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('wheel', onScrollOrWheel)
      window.removeEventListener('scroll', onScrollOrWheel)
    }
  }, [closeNotice, notice])

  useEffect(
    () => () => {
      clearTimers()
    },
    [clearTimers],
  )

  if (!notice) return null

  return (
    <div
      ref={noticeRef}
      role="status"
      aria-live="polite"
      className={`fixed z-50 max-w-84 rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-md transition-opacity duration-180 dark:bg-black/80 dark:text-white dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] dark:ring-white/10 ${
        isNoticeVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ left: notice.left, top: notice.top }}
    >
      {notice.text}
    </div>
  )
}
