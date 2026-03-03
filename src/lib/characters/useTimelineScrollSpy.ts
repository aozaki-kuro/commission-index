import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { clearHashIfTargetIsStale } from '#lib/navigation/hashAnchor'
import { getActiveSectionId, getScrollThreshold, resolveElementsByIds } from './scrollSpy'
import { useEffect, useRef, useState } from 'react'

const isInActiveTimelinePanel = (element: HTMLElement) => {
  const panel = element.closest<HTMLElement>('[data-commission-view-panel]')
  if (!panel) return true
  if (panel.dataset.commissionViewPanel !== 'timeline') return false
  return panel.dataset.commissionViewActive !== 'false'
}

const resolveTimelineTitleElements = (titleIds: string[]): HTMLElement[] =>
  resolveElementsByIds(titleIds).filter(isInActiveTimelinePanel)

interface UseTimelineScrollSpyOptions {
  enabled?: boolean
}

export const useTimelineScrollSpy = (
  titleIds: string[],
  { enabled = true }: UseTimelineScrollSpyOptions = {},
) => {
  const [activeId, setActiveId] = useState<string>('')
  const rafIdRef = useRef<number | null>(null)
  const thresholdRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      return
    }

    const updateThreshold = () => {
      thresholdRef.current = getScrollThreshold()
    }

    const scheduleUpdate = () => {
      if (rafIdRef.current !== null) return

      let completedSynchronously = false
      const nextRafId = requestAnimationFrame(() => {
        completedSynchronously = true
        rafIdRef.current = null

        const elements = resolveTimelineTitleElements(titleIds)
        setActiveId(elements.length > 0 ? getActiveSectionId(elements, thresholdRef.current) : '')
        clearHashIfTargetIsStale()
      })

      rafIdRef.current = completedSynchronously ? null : nextRafId
    }

    updateThreshold()

    const onResize = () => {
      updateThreshold()
      scheduleUpdate()
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleUpdate)

    scheduleUpdate()

    return () => {
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', onResize)
      window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, scheduleUpdate)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [enabled, titleIds])

  return enabled ? activeId : ''
}
