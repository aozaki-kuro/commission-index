'use client'

import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { useCharacterScrollSpy } from '#lib/characters/useCharacterScrollSpy'
import { useEffect, useRef, useState } from 'react'

interface CharacterListEnhancerProps {
  titleIds: string[]
  itemCount: number
}

const ACTIVE_DOT_CLASSES = ['scale-100', 'opacity-100']
const INACTIVE_DOT_CLASSES = ['scale-0', 'opacity-0']
const SIDEBAR_SEARCH_STATE_EVENT = 'sidebar-search-state-change'

const CharacterListEnhancer = ({ titleIds, itemCount }: CharacterListEnhancerProps) => {
  const activeId = useCharacterScrollSpy(titleIds)
  const hasTrackedSidebarUsageRef = useRef(false)
  const [isSearchActive, setIsSearchActive] = useState(false)

  useEffect(() => {
    const onSearchStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail
      setIsSearchActive(Boolean(detail?.active))
    }

    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSearchStateChange)

    return () => {
      window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSearchStateChange)
    }
  }, [])

  useEffect(() => {
    const dots = document.querySelectorAll<HTMLElement>('[data-sidebar-dot-for]')

    dots.forEach(dot => {
      const dotTitleId = dot.dataset.sidebarDotFor
      const isActive = !isSearchActive && dotTitleId === activeId
      dot.classList.toggle(ACTIVE_DOT_CLASSES[0], isActive)
      dot.classList.toggle(ACTIVE_DOT_CLASSES[1], isActive)
      dot.classList.toggle(INACTIVE_DOT_CLASSES[0], !isActive)
      dot.classList.toggle(INACTIVE_DOT_CLASSES[1], !isActive)
    })
  }, [activeId, isSearchActive])

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
