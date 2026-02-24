'use client'

import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '#lib/navigation/syncHiddenSectionLinkAvailability'
import { useCharacterScrollSpy } from '#lib/characters/useCharacterScrollSpy'
import { useEffect, useRef } from 'react'

interface CharacterListEnhancerProps {
  titleIds: string[]
  itemCount: number
  enableActiveDots?: boolean
}

const ACTIVE_DOT_CLASSES = ['scale-100', 'opacity-100']
const INACTIVE_DOT_CLASSES = ['scale-0', 'opacity-0']
const CharacterListEnhancer = ({
  titleIds,
  itemCount,
  enableActiveDots = true,
}: CharacterListEnhancerProps) => {
  const activeId = useCharacterScrollSpy(titleIds)
  const hasTrackedSidebarUsageRef = useRef(false)
  const dotByTitleIdRef = useRef<Map<string, HTMLElement>>(new Map())
  const activeDotRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!enableActiveDots) {
      dotByTitleIdRef.current = new Map()
      activeDotRef.current = null
      return
    }

    dotByTitleIdRef.current = new Map(
      Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-dot-for]'))
        .map(dot => [dot.dataset.sidebarDotFor, dot] as const)
        .filter(([titleId]) => Boolean(titleId)) as Array<[string, HTMLElement]>,
    )
    activeDotRef.current = null
  }, [enableActiveDots, titleIds])

  useEffect(() => {
    if (!enableActiveDots) {
      activeDotRef.current = null
      return
    }

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
  }, [activeId, enableActiveDots, titleIds])

  useEffect(() => {
    const root = document.getElementById('Character List')
    if (!root) return

    const syncCharacterLinkAvailability = () => {
      syncHiddenSectionLinkAvailability({
        root,
        linkSelector: '[data-sidebar-character-link="true"]',
        getSectionId: link => {
          const rawHash = link.getAttribute('href')
          return rawHash?.startsWith('#') ? rawHash.slice(1) : null
        },
      })
    }

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
        if (characterLink.getAttribute('aria-disabled') === 'true') {
          event.preventDefault()
          return
        }
        trackSidebarUsage('character_link')
      }
    }

    syncCharacterLinkAvailability()
    root.addEventListener('click', onClick)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncCharacterLinkAvailability)
    return () => {
      root.removeEventListener('click', onClick)
      window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncCharacterLinkAvailability)
    }
  }, [itemCount])

  return null
}

export default CharacterListEnhancer
