'use client'

import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { useCharacterScrollSpy } from '#lib/characters/useCharacterScrollSpy'
import { useEffect, useRef } from 'react'

interface CharacterListEnhancerProps {
  titleIds: string[]
  itemCount: number
}

const ACTIVE_DOT_CLASSES = ['scale-100', 'opacity-100']
const INACTIVE_DOT_CLASSES = ['scale-0', 'opacity-0']
const CharacterListEnhancer = ({ titleIds, itemCount }: CharacterListEnhancerProps) => {
  const activeId = useCharacterScrollSpy(titleIds)
  const hasTrackedSidebarUsageRef = useRef(false)
  const dotByTitleIdRef = useRef<Map<string, HTMLElement>>(new Map())
  const activeDotRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    dotByTitleIdRef.current = new Map(
      Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-dot-for]'))
        .map(dot => [dot.dataset.sidebarDotFor, dot] as const)
        .filter(([titleId]) => Boolean(titleId)) as Array<[string, HTMLElement]>,
    )
  }, [])

  useEffect(() => {
    const previousDot = activeDotRef.current
    const nextDot = activeId ? (dotByTitleIdRef.current.get(activeId) ?? null) : null

    if (previousDot && previousDot !== nextDot) {
      previousDot.classList.remove(...ACTIVE_DOT_CLASSES)
      previousDot.classList.add(...INACTIVE_DOT_CLASSES)
    }

    if (nextDot && nextDot !== previousDot) {
      nextDot.classList.remove(...INACTIVE_DOT_CLASSES)
      nextDot.classList.add(...ACTIVE_DOT_CLASSES)
    }

    activeDotRef.current = nextDot
  }, [activeId])

  useEffect(() => {
    const root = document.getElementById('Character List')
    if (!root) return

    const trackSidebarUsage = (source: 'character_link' | 'search_link') => {
      if (hasTrackedSidebarUsageRef.current) return
      hasTrackedSidebarUsageRef.current = true

      trackRybbitEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
        source,
        item_count: itemCount,
      })
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const searchLink = target.closest<HTMLAnchorElement>('[data-sidebar-search-link="true"]')
      if (searchLink) {
        event.preventDefault()
        trackSidebarUsage('search_link')
        jumpToCommissionSearch()
        return
      }

      const characterLink = target.closest<HTMLAnchorElement>(
        '[data-sidebar-character-link="true"]',
      )
      if (characterLink) {
        trackSidebarUsage('character_link')
      }
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [itemCount])

  return null
}

export default CharacterListEnhancer
