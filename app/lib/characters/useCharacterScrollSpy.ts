'use client'

import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { clearHashIfTargetIsStale } from '#lib/navigation/hashAnchor'
import { useEffect, useRef, useState } from 'react'

const getScrollThreshold = () => {
  return window.innerHeight / 2
}

const isElementVisible = (element: HTMLElement) => element.getClientRects().length > 0

const isElementAtThreshold = (element: HTMLElement, threshold: number) => {
  if (!isElementVisible(element)) return false
  const rect = element.getBoundingClientRect()
  return rect.top <= threshold && rect.bottom >= threshold
}

const isRectInViewport = (rect: DOMRect) => rect.bottom > 0 && rect.top < window.innerHeight

const getActiveSectionId = (elements: HTMLElement[], threshold: number): string => {
  let thresholdActiveId = ''
  let firstVisibleInViewportId = ''
  let firstVisibleId = ''

  for (const element of elements) {
    if (!isElementVisible(element)) continue
    if (!firstVisibleId) {
      firstVisibleId = element.id
    }

    const rect = element.getBoundingClientRect()

    if (!firstVisibleInViewportId && isRectInViewport(rect)) {
      firstVisibleInViewportId = element.id
    }

    if (rect.top <= threshold) {
      thresholdActiveId = element.id
      continue
    }

    break
  }

  return thresholdActiveId || firstVisibleInViewportId || firstVisibleId
}

const hasSearchQueryInUrl = () => {
  const query = new URLSearchParams(window.location.search).get('q')
  return Boolean(query?.trim())
}

interface UseCharacterScrollSpyOptions {
  enabled?: boolean
  introductionId?: string
}

export const useCharacterScrollSpy = (
  titleIds: string[],
  { enabled = true, introductionId = 'title-introduction' }: UseCharacterScrollSpyOptions = {},
) => {
  const [activeId, setActiveId] = useState<string>('')
  const rafId = useRef<number | null>(null)
  const thresholdRef = useRef<number>(0)
  const sectionElementsRef = useRef<HTMLElement[]>([])
  const introductionElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) {
      introductionElementRef.current = null
      sectionElementsRef.current = []
      return
    }

    introductionElementRef.current = document.getElementById(introductionId)
    sectionElementsRef.current = titleIds
      .map(id => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))
  }, [enabled, introductionId, titleIds])

  useEffect(() => {
    if (!enabled) return

    const updateThreshold = () => {
      thresholdRef.current = getScrollThreshold()
    }

    updateThreshold()
    window.addEventListener('resize', updateThreshold)

    return () => window.removeEventListener('resize', updateThreshold)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      return
    }

    const updateActiveId = () => {
      const introductionElement = introductionElementRef.current
      const threshold = thresholdRef.current
      const isAtIntroduction =
        introductionElement && isElementAtThreshold(introductionElement, threshold)
      const hasUrlSearchQuery = hasSearchQueryInUrl()

      if (!hasUrlSearchQuery && (window.scrollY === 0 || isAtIntroduction)) {
        setActiveId('')
        clearHashIfTargetIsStale()
        return
      }

      setActiveId(getActiveSectionId(sectionElementsRef.current, threshold))
      clearHashIfTargetIsStale()
    }

    const scheduleUpdate = () => {
      if (rafId.current !== null) return

      let completedSynchronously = false
      const nextRafId = requestAnimationFrame(() => {
        completedSynchronously = true
        rafId.current = null
        updateActiveId()
      })

      rafId.current = completedSynchronously ? null : nextRafId
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleUpdate)
    scheduleUpdate()

    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleUpdate)
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
      }
    }
  }, [enabled, introductionId, titleIds])

  return enabled ? activeId : ''
}
