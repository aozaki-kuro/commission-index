import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import { buildCharacterNavItems, type CharacterNavItem } from '#lib/characters/nav'
import { scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '#lib/navigation/syncHiddenSectionLinkAvailability'
import { SidebarMenu, SidebarMenuItem } from '#components/ui/sidebar'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STYLES } from './constants'
import { ChevronIcon } from './Icons'
import type { CharacterEntry } from './types'

interface ListItemProps {
  item: CharacterNavItem
  href?: string
  close: () => void
  preventHashWrite?: boolean
}

const ListItem = memo(({ item, href, close, preventHashWrite = false }: ListItemProps) => {
  return (
    <a
      href={href ?? `/${item.titleHash}`}
      data-mobile-nav-link="true"
      data-mobile-nav-section-id={item.sectionId}
      onClick={event => {
        if (event.currentTarget.getAttribute('aria-disabled') === 'true') {
          event.preventDefault()
          return
        }

        if (preventHashWrite) {
          const didScroll = scrollToHashTargetFromHrefWithoutHash(
            event.currentTarget.getAttribute('href'),
          )
          if (didScroll) event.preventDefault()
        }

        close()
      }}
      className={STYLES.listItem}
    >
      {item.displayName}
    </a>
  )
})
ListItem.displayName = 'ListItem'

interface NavItemsListProps {
  items: CharacterNavItem[]
  close: () => void
  useTimelineHref?: boolean
  preventHashWrite?: boolean
}

const NavItemsList = memo(
  ({ items, close, useTimelineHref = false, preventHashWrite = false }: NavItemsListProps) => (
    <SidebarMenu>
      {items.map(item => (
        <SidebarMenuItem key={item.sectionId}>
          <ListItem
            item={item}
            href={useTimelineHref ? `/?view=timeline${item.sectionHash}` : undefined}
            close={close}
            preventHashWrite={preventHashWrite}
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  ),
)
NavItemsList.displayName = 'NavItemsList'

type ExpandedSection = 'active' | 'stale'

interface CharacterSectionProps {
  id: string
  label: string
  expanded: boolean
  onExpand: () => void
  emptyLabel: string
  items: CharacterNavItem[]
  close: () => void
}

const CharacterSection = memo(
  ({ id, label, expanded, onExpand, emptyLabel, items, close }: CharacterSectionProps) => {
    return (
      <section className="mt-1.5 first:mt-0">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          aria-controls={id}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg px-4 py-2 text-left font-mono transition-colors duration-150 hover:bg-white/70 dark:hover:bg-white/10"
        >
          <p className="text-base leading-6 font-bold text-gray-700 dark:text-gray-200">{label}</p>
          <ChevronIcon isExpanded={expanded} />
        </button>
        <div id={id} hidden={!expanded} className="mt-1">
          {items.length > 0 ? (
            <NavItemsList items={items} close={close} />
          ) : (
            <p className="px-4 py-2 font-mono text-sm text-gray-500 dark:text-gray-400">
              {emptyLabel}
            </p>
          )}
        </div>
      </section>
    )
  },
)
CharacterSection.displayName = 'CharacterSection'

interface CharacterMenuListProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
  timelineNavItems: CharacterNavItem[]
  close: () => void
}

const CharacterMenuList = memo(
  ({ active, stale, timelineNavItems, close }: CharacterMenuListProps) => {
    const { mode } = useCommissionViewMode()
    const [expandedSection, setExpandedSection] = useState<ExpandedSection>('active')
    const rootRef = useRef<HTMLDivElement>(null)

    const activeNavItems = useMemo(() => buildCharacterNavItems(active), [active])
    const staleNavItems = useMemo(() => buildCharacterNavItems(stale), [stale])

    const activeSectionIds = useMemo(
      () => activeNavItems.map(item => item.sectionId).join('\n'),
      [activeNavItems],
    )
    const staleSectionIds = useMemo(
      () => staleNavItems.map(item => item.sectionId).join('\n'),
      [staleNavItems],
    )
    const timelineSectionIds = useMemo(
      () => timelineNavItems.map(item => item.sectionId).join('\n'),
      [timelineNavItems],
    )

    const syncLinkAvailability = useCallback(() => {
      const root = rootRef.current
      if (!root) return

      syncHiddenSectionLinkAvailability({
        root,
        linkSelector: '[data-mobile-nav-link="true"]',
        getSectionId: link => link.dataset.mobileNavSectionId ?? null,
      })
    }, [])

    useEffect(() => {
      syncLinkAvailability()
      window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncLinkAvailability)
      return () => window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncLinkAvailability)
    }, [
      activeSectionIds,
      expandedSection,
      mode,
      staleSectionIds,
      syncLinkAvailability,
      timelineSectionIds,
    ])

    return (
      <div ref={rootRef} className="relative">
        {mode === 'timeline' ? (
          <NavItemsList items={timelineNavItems} close={close} useTimelineHref preventHashWrite />
        ) : (
          <>
            <CharacterSection
              id="mobile-active-characters"
              label="Active Characters"
              expanded={expandedSection === 'active'}
              onExpand={() => setExpandedSection('active')}
              emptyLabel="No active characters."
              items={activeNavItems}
              close={close}
            />
            <CharacterSection
              id="mobile-stale-characters"
              label="Stale Characters"
              expanded={expandedSection === 'stale'}
              onExpand={() => setExpandedSection('stale')}
              emptyLabel="No stale characters."
              items={staleNavItems}
              close={close}
            />
          </>
        )}
      </div>
    )
  },
)
CharacterMenuList.displayName = 'CharacterMenuList'

export default CharacterMenuList
