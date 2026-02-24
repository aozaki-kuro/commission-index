import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import { buildCharacterNavItems, type CharacterNavItem } from '#lib/characters/nav'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '#lib/navigation/syncHiddenSectionLinkAvailability'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LIST_TRANSITION_MS, STYLES } from './constants'
import { ChevronIcon } from './Icons'
import type { CharacterEntry } from './types'

interface ListItemProps {
  item: CharacterNavItem
  href?: string
  close: () => void
}

const ListItem = memo(({ item, href, close }: ListItemProps) => {
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
}

const NavItemsList = memo(({ items, close, useTimelineHref = false }: NavItemsListProps) => (
  <ul>
    {items.map(item => (
      <li key={item.sectionId}>
        <ListItem
          item={item}
          href={useTimelineHref ? `/?view=timeline${item.sectionHash}` : undefined}
          close={close}
        />
      </li>
    ))}
  </ul>
))
NavItemsList.displayName = 'NavItemsList'

interface CharacterMenuListProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
  timelineNavItems: CharacterNavItem[]
  close: () => void
}

interface CharacterStatusListBodyProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
  close: () => void
}

const CharacterStatusListBody = memo(({ active, stale, close }: CharacterStatusListBodyProps) => {
  const [isStaleExpanded, setIsStaleExpanded] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isInitialRender, setIsInitialRender] = useState(true)
  const [containerHeight, setContainerHeight] = useState(0)

  const activeListRef = useRef<HTMLDivElement>(null)
  const staleListRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef(isStaleExpanded)

  useEffect(() => {
    expandedRef.current = isStaleExpanded
  }, [isStaleExpanded])

  const measureContainer = useCallback(() => {
    const target = (expandedRef.current ? staleListRef : activeListRef).current
    setContainerHeight(target?.scrollHeight ?? 0)
  }, [])

  useEffect(() => {
    const activeList = activeListRef.current
    const staleList = staleListRef.current
    if (!activeList || !staleList) return

    const resizeObserver = new ResizeObserver(() => measureContainer())
    resizeObserver.observe(activeList)
    resizeObserver.observe(staleList)

    const rafId = requestAnimationFrame(measureContainer)

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(rafId)
    }
  }, [measureContainer, active.length, stale.length])

  useEffect(() => {
    const rafId = requestAnimationFrame(measureContainer)
    return () => cancelAnimationFrame(rafId)
  }, [isStaleExpanded, measureContainer])

  useEffect(() => {
    const id = requestAnimationFrame(() => setIsInitialRender(false))
    return () => cancelAnimationFrame(id)
  }, [])

  const toggleStaleList = useCallback(() => {
    if (isAnimating) return
    setIsAnimating(true)
    setIsStaleExpanded(prev => !prev)
  }, [isAnimating])

  useEffect(() => {
    if (!isAnimating) return
    const id = window.setTimeout(() => setIsAnimating(false), LIST_TRANSITION_MS)
    return () => window.clearTimeout(id)
  }, [isAnimating])

  const activeNavItems = useMemo(() => buildCharacterNavItems(active), [active])
  const staleNavItems = useMemo(() => buildCharacterNavItems(stale), [stale])

  const getListTransform = (isStaleList: boolean) => {
    if (isInitialRender) return isStaleList ? 'translate-y-full' : 'translate-y-0'
    if (isStaleExpanded) return isStaleList ? 'translate-y-0' : '-translate-y-full'
    return isStaleList ? 'translate-y-full' : 'translate-y-0'
  }

  const getListOpacity = (isStaleList: boolean) => {
    if (isInitialRender) return isStaleList ? 'opacity-0' : 'opacity-100'
    if (isAnimating) return 'opacity-100'
    return isStaleExpanded
      ? isStaleList
        ? 'opacity-100'
        : 'opacity-0'
      : isStaleList
        ? 'opacity-0'
        : 'opacity-100'
  }

  const transitionClasses = isInitialRender ? '' : 'transition-all duration-300 ease-out'

  return (
    <>
      <div
        className={`relative overflow-hidden will-change-[height] ${
          isInitialRender ? '' : 'transition-[height] duration-300 ease-out'
        }`}
        style={{ height: containerHeight ? `${containerHeight}px` : undefined }}
      >
        <div
          ref={activeListRef}
          className={`absolute inset-x-0 w-full will-change-transform ${transitionClasses} ${getListTransform(false)} ${getListOpacity(false)}`}
        >
          <NavItemsList items={activeNavItems} close={close} />
        </div>

        <div
          ref={staleListRef}
          className={`absolute inset-x-0 w-full will-change-transform ${transitionClasses} ${getListTransform(true)} ${getListOpacity(true)}`}
        >
          <NavItemsList items={staleNavItems} close={close} />
        </div>
      </div>

      <button
        onClick={toggleStaleList}
        className={STYLES.toggleButton}
        type="button"
        disabled={isAnimating}
      >
        <p className="font-bold text-gray-600 dark:text-gray-300">Stale Characters</p>
        <ChevronIcon isExpanded={isStaleExpanded} />
      </button>
    </>
  )
})
CharacterStatusListBody.displayName = 'CharacterStatusListBody'

const CharacterMenuList = memo(
  ({ active, stale, timelineNavItems, close }: CharacterMenuListProps) => {
    const { mode } = useCommissionViewMode()
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      const syncLinkAvailability = () => {
        const root = rootRef.current
        if (!root) return

        syncHiddenSectionLinkAvailability({
          root,
          linkSelector: '[data-mobile-nav-link="true"]',
          getSectionId: link => link.dataset.mobileNavSectionId ?? null,
        })
      }

      syncLinkAvailability()
      window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncLinkAvailability)
      return () => window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncLinkAvailability)
    }, [active.length, mode, stale.length, timelineNavItems.length])

    return (
      <div ref={rootRef} className="relative">
        {mode === 'timeline' ? (
          <NavItemsList items={timelineNavItems} close={close} useTimelineHref />
        ) : (
          <CharacterStatusListBody active={active} stale={stale} close={close} />
        )}
      </div>
    )
  },
)
CharacterMenuList.displayName = 'CharacterMenuList'

export default CharacterMenuList
