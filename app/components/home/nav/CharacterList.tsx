'use client'

import DevAdminLink from '#components/home/nav/DevAdminLink'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import { buildCharacterNavItems, type CharacterNavItem } from '#lib/characters/nav'
import { useCharacterScrollSpy } from '#lib/characters/useCharacterScrollSpy'
import { useTimelineScrollSpy } from '#lib/characters/useTimelineScrollSpy'
import { useMemo } from 'react'
import CharacterListEnhancer from './CharacterListEnhancer'

interface CharacterListProps {
  characters: { DisplayName: string }[]
  monthNavItems?: CharacterNavItem[]
}

const HIDDEN_DOT_CLASSES = 'scale-0 opacity-0'
const ACTIVE_DOT_CLASSES = 'scale-100 opacity-100'
const UTILITY_ROW_WRAPPER_CLASSES =
  'relative flex min-h-5 items-center pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white'
const UTILITY_ROW_TEXT_CLASSES =
  'font-mono text-sm leading-5 font-bold no-underline transition-colors duration-200'
const VIEW_MODE_TOGGLE_ITEMS = [
  { mode: 'character', label: 'By Character' },
  { mode: 'timeline', label: 'By Date' },
] as const

interface ModeToggleButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

const ModeToggleButton = ({ label, active, onClick }: ModeToggleButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    data-link-style="true"
    className={`${UTILITY_ROW_WRAPPER_CLASSES} w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left no-underline ${
      active ? 'text-gray-900 dark:text-white' : ''
    }`.trim()}
  >
    <span
      className={`absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-all duration-300 ${
        active ? 'scale-100 bg-gray-500 opacity-100' : 'scale-0 opacity-0'
      }`}
      aria-hidden="true"
    />
    <span className={UTILITY_ROW_TEXT_CLASSES}>{label}</span>
  </button>
)

const CharacterList = ({ characters, monthNavItems = [] }: CharacterListProps) => {
  const { mode, setMode } = useCommissionViewMode()
  const characterNavItems = useMemo(
    () => (mode === 'character' ? buildCharacterNavItems(characters) : []),
    [characters, mode],
  )
  const navItems = mode === 'timeline' ? monthNavItems : characterNavItems
  const titleIds = useMemo(() => navItems.map(item => item.titleId), [navItems])
  const showActiveDots = navItems.length > 0
  const activeCharacterTitleId = useCharacterScrollSpy(mode === 'character' ? titleIds : [], {
    enabled: mode === 'character',
  })
  const activeTimelineTitleId = useTimelineScrollSpy(mode === 'timeline' ? titleIds : [], {
    enabled: mode === 'timeline',
  })
  const activeTitleId = mode === 'timeline' ? activeTimelineTitleId : activeCharacterTitleId
  const navItemsKey = useMemo(() => navItems.map(item => item.sectionId).join('\n'), [navItems])
  const showAdminLink = process.env.NODE_ENV === 'development'

  return (
    <aside
      id="Character List"
      className="hidden md:top-52 md:left-[calc(50%+22rem)] md:h-screen md:w-full md:max-w-50 lg:fixed lg:block"
    >
      <div className="sticky top-4 ml-8 space-y-2">
        <div className="space-y-4 pb-2">
          <div className={UTILITY_ROW_WRAPPER_CLASSES}>
            <svg
              viewBox="0 0 24 24"
              className="absolute top-1/2 left-0 h-3 w-3 -translate-x-1 -translate-y-1/2 text-gray-400 transition-all duration-300"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-4.4-4.4"
              />
              <circle cx="11" cy="11" r="6" strokeWidth="2" />
            </svg>
            <a
              href="#commission-search"
              data-sidebar-search-link="true"
              className={UTILITY_ROW_TEXT_CLASSES}
            >
              Search
            </a>
          </div>

          <div className="space-y-2">
            {VIEW_MODE_TOGGLE_ITEMS.map(item => (
              <ModeToggleButton
                key={item.mode}
                label={item.label}
                active={mode === item.mode}
                onClick={() => {
                  trackRybbitEvent(ANALYTICS_EVENTS.sidebarViewModeToggleUsed, {
                    from_mode: mode,
                    to_mode: item.mode,
                    already_active: mode === item.mode,
                  })
                  setMode(item.mode)
                }}
              />
            ))}
          </div>

          {showAdminLink ? <DevAdminLink /> : null}
        </div>

        <nav>
          <ul className="space-y-2">
            {navItems.map(({ displayName, sectionId, sectionHash, titleId }) => (
              <li
                key={sectionId}
                className="relative pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                {showActiveDots ? (
                  <div
                    data-sidebar-dot-for={titleId}
                    className={`absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-400 transition-all duration-300 ${
                      titleId === activeTitleId ? ACTIVE_DOT_CLASSES : HIDDEN_DOT_CLASSES
                    }`}
                  />
                ) : null}
                <a
                  href={sectionHash}
                  data-sidebar-character-link="true"
                  className="font-mono text-sm no-underline transition-colors duration-200"
                >
                  {displayName}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <CharacterListEnhancer itemCount={navItems.length} navItemsKey={navItemsKey} mode={mode} />
    </aside>
  )
}

export default CharacterList
