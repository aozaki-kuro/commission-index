'use client'

import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import {
  clearHashIfTargetIsStale,
  scrollToHashTargetFromHrefWithoutHash,
} from '#lib/navigation/hashAnchor'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '#lib/navigation/syncHiddenSectionLinkAvailability'
import { useEffect, useRef } from 'react'

interface CharacterListEnhancerProps {
  itemCount: number
  navItemsKey?: string
  mode?: 'character' | 'timeline'
}

const CharacterListEnhancer = ({
  itemCount,
  navItemsKey = '',
  mode = 'character',
}: CharacterListEnhancerProps) => {
  const hasTrackedSidebarSearchUsageRef = useRef(false)

  useEffect(() => {
    let rafId: number | null = null

    const run = () => {
      rafId = null
      clearHashIfTargetIsStale()
    }

    const schedule = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(run)
    }

    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, schedule)
    schedule()

    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, schedule)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

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

    const trackSidebarSearchUsage = () => {
      if (hasTrackedSidebarSearchUsageRef.current) return
      hasTrackedSidebarSearchUsageRef.current = true
      trackRybbitEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
        source: 'search_link',
        nav_surface: 'sidebar',
        view_mode: mode,
        item_count: itemCount,
      })
    }

    const trackSidebarCharacterClick = (link: HTMLAnchorElement) => {
      trackRybbitEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
        source: 'character_link',
        nav_surface: 'sidebar',
        view_mode: mode,
        item_count: itemCount,
        character_name: link.textContent?.trim() || 'unknown',
        section_id: link.getAttribute('href')?.replace(/^#/, '') || 'unknown',
      })
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const searchLink = target.closest<HTMLAnchorElement>('[data-sidebar-search-link="true"]')
      if (searchLink) {
        event.preventDefault()
        trackSidebarSearchUsage()
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

        if (mode === 'timeline') {
          event.preventDefault()
          scrollToHashTargetFromHrefWithoutHash(characterLink.getAttribute('href'))
        }

        trackSidebarCharacterClick(characterLink)
      }
    }

    syncCharacterLinkAvailability()
    root.addEventListener('click', onClick)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncCharacterLinkAvailability)
    return () => {
      root.removeEventListener('click', onClick)
      window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncCharacterLinkAvailability)
    }
  }, [itemCount, mode, navItemsKey])

  return null
}

export default CharacterListEnhancer
