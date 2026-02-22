'use client'
import DevAdminLink from '#components/home/nav/DevAdminLink'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { buildCharacterNavItems } from '#lib/characters/nav'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { useCharacterScrollSpy } from '#lib/characters/useCharacterScrollSpy'
import { useCallback, useMemo, useRef } from 'react'

interface CharacterListProps {
  characters: { DisplayName: string }[]
}

const CharacterList = ({ characters }: CharacterListProps) => {
  const navItems = useMemo(() => buildCharacterNavItems(characters), [characters])
  const titleIds = useMemo(() => navItems.map(item => item.titleId), [navItems])
  const activeId = useCharacterScrollSpy(titleIds)
  const hasTrackedSidebarUsageRef = useRef(false)

  const showAdminLink = process.env.NODE_ENV === 'development'
  const jumpToSearch = useCallback(() => jumpToCommissionSearch(), [])
  const trackSidebarUsage = useCallback(
    (source: 'character_link' | 'search_link') => {
      if (hasTrackedSidebarUsageRef.current) return
      hasTrackedSidebarUsageRef.current = true

      trackRybbitEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
        source,
        item_count: navItems.length,
      })
    },
    [navItems.length],
  )

  return (
    <aside
      id="Character List"
      className="hidden md:top-52 md:left-[calc(50%+22rem)] md:h-screen md:w-full md:max-w-50 lg:fixed lg:block"
    >
      <div className="sticky top-4 ml-8 space-y-4">
        <nav>
          <ul className="space-y-2">
            {navItems.map(({ displayName, sectionId, sectionHash, titleId }) => {
              const isActive = activeId === titleId

              return (
                <li
                  key={sectionId}
                  className="relative pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
                >
                  <div
                    className={`absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-400 transition-all duration-300 ${
                      isActive ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    }`}
                  />
                  <a
                    href={sectionHash}
                    onClick={() => trackSidebarUsage('character_link')}
                    className="font-mono text-sm no-underline transition-colors duration-200"
                  >
                    {displayName}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="relative flex pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white">
          <svg
            viewBox="0 0 24 24"
            className="absolute top-1/2 left-0 h-3 w-3 -translate-x-1 -translate-y-1/2 text-gray-400 transition-all duration-300"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
            <circle cx="11" cy="11" r="6" strokeWidth="2" />
          </svg>
          <a
            href="#commission-search"
            onClick={event => {
              event.preventDefault()
              trackSidebarUsage('search_link')
              jumpToSearch()
            }}
            className="font-mono text-sm font-bold no-underline transition-colors duration-200"
          >
            Search
          </a>
        </div>

        {showAdminLink ? <DevAdminLink /> : null}
      </div>
    </aside>
  )
}

export default CharacterList
