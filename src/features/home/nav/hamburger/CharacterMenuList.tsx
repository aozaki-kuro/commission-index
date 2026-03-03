import { useCommissionViewMode } from '#features/home/commission/CommissionViewMode'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
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
  itemCount: number
  viewMode: 'character' | 'timeline'
}

const ListItem = memo(
  ({ item, href, close, preventHashWrite = false, itemCount, viewMode }: ListItemProps) => {
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

          trackRybbitEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
            source: 'character_link',
            nav_surface: 'hamburger',
            view_mode: viewMode,
            item_count: itemCount,
            character_name: item.displayName,
            section_id: item.sectionId,
          })

          close()
        }}
        className={STYLES.listItem}
      >
        {item.displayName}
      </a>
    )
  },
)
ListItem.displayName = 'ListItem'

interface NavItemsListProps {
  items: CharacterNavItem[]
  close: () => void
  useTimelineHref?: boolean
  preventHashWrite?: boolean
  itemCount: number
  viewMode: 'character' | 'timeline'
}

const NavItemsList = memo(
  ({
    items,
    close,
    useTimelineHref = false,
    preventHashWrite = false,
    itemCount,
    viewMode,
  }: NavItemsListProps) => (
    <SidebarMenu>
      {items.map(item => (
        <SidebarMenuItem key={item.sectionId}>
          <ListItem
            item={item}
            href={useTimelineHref ? `/?view=timeline${item.sectionHash}` : undefined}
            close={close}
            preventHashWrite={preventHashWrite}
            itemCount={itemCount}
            viewMode={viewMode}
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
  itemCount: number
  viewMode: 'character' | 'timeline'
}

const CharacterSection = memo(
  ({
    id,
    label,
    expanded,
    onExpand,
    emptyLabel,
    items,
    close,
    itemCount,
    viewMode,
  }: CharacterSectionProps) => {
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
            <NavItemsList items={items} close={close} itemCount={itemCount} viewMode={viewMode} />
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
    const totalNavItemsCount =
      mode === 'timeline' ? timelineNavItems.length : active.length + stale.length

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
          <NavItemsList
            items={timelineNavItems}
            close={close}
            useTimelineHref
            preventHashWrite
            itemCount={totalNavItemsCount}
            viewMode={mode}
          />
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
              itemCount={totalNavItemsCount}
              viewMode={mode}
            />
            <CharacterSection
              id="mobile-stale-characters"
              label="Stale Characters"
              expanded={expandedSection === 'stale'}
              onExpand={() => setExpandedSection('stale')}
              emptyLabel="No stale characters."
              items={staleNavItems}
              close={close}
              itemCount={totalNavItemsCount}
              viewMode={mode}
            />
          </>
        )}
      </div>
    )
  },
)
CharacterMenuList.displayName = 'CharacterMenuList'

export default CharacterMenuList
