'use client'

import DevAdminLink from '#components/home/nav/DevAdminLink'
import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import { buildCharacterNavItems, type CharacterNavItem } from '#lib/characters/nav'
import { useMemo } from 'react'
import CharacterListEnhancer from './CharacterListEnhancer'

interface CharacterListProps {
  characters: { DisplayName: string }[]
  monthNavItems?: CharacterNavItem[]
}

const HIDDEN_DOT_CLASSES = 'scale-0 opacity-0'
const UTILITY_ROW_WRAPPER_CLASSES =
  'relative flex min-h-5 items-center pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white'
const UTILITY_ROW_TEXT_CLASSES =
  'font-mono text-sm leading-5 font-bold no-underline transition-colors duration-200'

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
    className={`${UTILITY_ROW_WRAPPER_CLASSES} w-full appearance-none border-0 bg-transparent p-0 text-left ${
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
  const characterNavItems = useMemo(() => buildCharacterNavItems(characters), [characters])
  const navItems = mode === 'timeline' ? monthNavItems : characterNavItems
  const titleIds = navItems.map(item => item.titleId)
  const showActiveDots = mode === 'character'
  const showAdminLink = process.env.NODE_ENV === 'development'

  return (
    <aside
      id="Character List"
      className="hidden md:top-52 md:left-[calc(50%+22rem)] md:h-screen md:w-full md:max-w-50 lg:fixed lg:block"
    >
      <div className="sticky top-4 ml-8 space-y-2">
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
                    className={`absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-400 transition-all duration-300 ${HIDDEN_DOT_CLASSES}`}
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

        <div className="space-y-4 pt-2">
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
            <ModeToggleButton
              label="By Character"
              active={mode === 'character'}
              onClick={() => {
                if (mode === 'character') return
                setMode('character')
              }}
            />
            <ModeToggleButton
              label="By Date"
              active={mode === 'timeline'}
              onClick={() => {
                if (mode === 'timeline') return
                setMode('timeline')
              }}
            />
          </div>

          {showAdminLink ? <DevAdminLink /> : null}
        </div>
      </div>

      <CharacterListEnhancer
        titleIds={showActiveDots ? titleIds : []}
        itemCount={navItems.length}
        enableActiveDots={showActiveDots}
      />
    </aside>
  )
}

export default CharacterList
