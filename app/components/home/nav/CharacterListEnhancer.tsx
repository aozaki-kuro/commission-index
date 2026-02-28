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
  const hasTrackedSidebarUsageRef = useRef(false)

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

        if (mode === 'timeline') {
          event.preventDefault()
          scrollToHashTargetFromHrefWithoutHash(characterLink.getAttribute('href'))
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
  }, [itemCount, mode, navItemsKey])

  return null
}

export default CharacterListEnhancer
