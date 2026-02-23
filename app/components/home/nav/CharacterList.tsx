import DevAdminLink from '#components/home/nav/DevAdminLink'
import { buildCharacterNavItems } from '#lib/characters/nav'
import CharacterListEnhancer from './CharacterListEnhancer'

interface CharacterListProps {
  characters: { DisplayName: string }[]
}

const HIDDEN_DOT_CLASSES = 'scale-0 opacity-0'

const CharacterList = ({ characters }: CharacterListProps) => {
  const navItems = buildCharacterNavItems(characters)
  const titleIds = navItems.map(item => item.titleId)
  const showAdminLink = process.env.NODE_ENV === 'development'

  return (
    <aside
      id="Character List"
      className="hidden md:top-52 md:left-[calc(50%+22rem)] md:h-screen md:w-full md:max-w-50 lg:fixed lg:block"
    >
      <div className="sticky top-4 ml-8 space-y-4">
        <nav>
          <ul className="space-y-2">
            {navItems.map(({ displayName, sectionId, sectionHash, titleId }) => (
              <li
                key={sectionId}
                className="relative pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
              >
                <div
                  data-sidebar-dot-for={titleId}
                  className={`absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gray-400 transition-all duration-300 ${HIDDEN_DOT_CLASSES}`}
                />
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
            data-sidebar-search-link="true"
            className="font-mono text-sm font-bold no-underline transition-colors duration-200"
          >
            Search
          </a>
        </div>

        {showAdminLink ? <DevAdminLink /> : null}
      </div>

      <CharacterListEnhancer titleIds={titleIds} itemCount={navItems.length} />
    </aside>
  )
}

export default CharacterList
