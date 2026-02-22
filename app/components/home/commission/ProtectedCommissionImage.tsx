'use client'

import Image, { type StaticImageData } from 'next/image'
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react'

type ProtectedCommissionImageProps = {
  altText: string
  mappedImage?: StaticImageData
  resolvedImageSrc: string
}

type NoticeState = {
  left: number
  top: number
}

const NOTICE_FADE_MS = 180
const NOTICE_HIDE_MS = 2200
const NOTICE_OFFSET = 14
const NOTICE_MIN_OFFSET = 12
const NOTICE_WIDTH = 356
const NOTICE_HEIGHT = 120

const ProtectedCommissionImage = ({
  altText,
  mappedImage,
  resolvedImageSrc,
}: ProtectedCommissionImageProps) => {
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [isNoticeVisible, setIsNoticeVisible] = useState(false)
  const cacheBustId = useId()
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  const fallbackSrc =
    process.env.NODE_ENV === 'development'
      ? `${resolvedImageSrc}${resolvedImageSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheBustId)}`
      : resolvedImageSrc

  const closeNotice = useCallback(() => {
    if (!noticeRef.current) {
      setNotice(null)
      return
    }
    setIsNoticeVisible(false)
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
    removeTimerRef.current = setTimeout(() => {
      setNotice(null)
    }, NOTICE_FADE_MS)
  }, [])

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
  }, [notice, closeNotice])

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current)
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)

    const left = Math.min(
      event.clientX + NOTICE_OFFSET,
      Math.max(NOTICE_MIN_OFFSET, window.innerWidth - NOTICE_WIDTH),
    )
    const top = Math.min(
      event.clientY + NOTICE_OFFSET,
      Math.max(NOTICE_MIN_OFFSET, window.innerHeight - NOTICE_HEIGHT),
    )

    setNotice({
      left,
      top,
    })
    setIsNoticeVisible(false)
    animationFrameRef.current = requestAnimationFrame(() => {
      setIsNoticeVisible(true)
    })

    hideTimerRef.current = setTimeout(() => {
      closeNotice()
    }, NOTICE_HIDE_MS)
  }

  return (
    <>
      <div onContextMenu={onContextMenu}>
        {mappedImage ? (
          <Image
            src={mappedImage}
            alt={altText}
            placeholder="blur"
            className="pointer-events-none select-none"
            loading="lazy"
          />
        ) : (
          <Image
            src={fallbackSrc}
            alt={altText}
            className="pointer-events-none select-none"
            loading="lazy"
            unoptimized
            width={1200}
            height={900}
            style={{ width: '100%', height: 'auto' }}
          />
        )}
      </div>

      {notice ? (
        <div
          ref={noticeRef}
          role="status"
          aria-live="polite"
          className={`fixed z-50 max-w-84 rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-md transition-opacity duration-180 dark:bg-black/80 dark:text-white dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] dark:ring-white/10 ${
            isNoticeVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ left: notice.left, top: notice.top }}
        >
          {altText}
        </div>
      ) : null}
    </>
  )
}

export default ProtectedCommissionImage
