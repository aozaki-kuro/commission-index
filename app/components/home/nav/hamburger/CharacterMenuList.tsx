import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import { buildCharacterNavItems, type CharacterNavItem } from '#lib/characters/nav'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LIST_TRANSITION_MS, STYLES } from './constants'
import { ChevronIcon } from './Icons'
import type { CharacterEntry } from './types'

const DISABLED_LINK_CLASSES = [
  'pointer-events-none',
  'cursor-not-allowed',
  'opacity-70',
  'text-gray-500',
  'dark:text-gray-400',
]

interface ListItemProps {
  item: CharacterNavItem
  href?: string
  sectionId?: string
  close: () => void
}

const ListItem = memo(({ item, href, sectionId, close }: ListItemProps) => {
  return (
    <a
      href={href ?? `/${item.titleHash}`}
      data-mobile-nav-link="true"
      data-mobile-nav-section-id={sectionId ?? item.sectionId}
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

interface CharacterMenuListProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
  timelineNavItems: CharacterNavItem[]
  close: () => void
}

const CharacterMenuList = memo(
  ({ active, stale, timelineNavItems, close }: CharacterMenuListProps) => {
    const { mode } = useCommissionViewMode()
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

    const activeItems = useMemo(
      () =>
        activeNavItems.map(item => (
          <li key={item.sectionId}>
            <ListItem item={item} sectionId={item.sectionId} close={close} />
          </li>
        )),
      [activeNavItems, close],
    )

    const staleItems = useMemo(
      () =>
        staleNavItems.map(item => (
          <li key={item.sectionId}>
            <ListItem item={item} sectionId={item.sectionId} close={close} />
          </li>
        )),
      [staleNavItems, close],
    )

    const timelineItems = useMemo(
      () =>
        timelineNavItems.map(item => (
          <li key={item.sectionId}>
            <ListItem
              item={item}
              sectionId={item.sectionId}
              href={`/?view=timeline${item.sectionHash}`}
              close={close}
            />
          </li>
        )),
      [close, timelineNavItems],
    )

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

    useEffect(() => {
      const syncLinkAvailability = () => {
        const links = document.querySelectorAll<HTMLAnchorElement>('[data-mobile-nav-link="true"]')

        for (const link of links) {
          const sectionId = link.dataset.mobileNavSectionId
          const section = sectionId ? document.getElementById(sectionId) : null
          const isDisabled = Boolean(section?.classList.contains('hidden'))

          if (isDisabled) {
            link.setAttribute('aria-disabled', 'true')
            link.tabIndex = -1
            link.classList.add(...DISABLED_LINK_CLASSES)
            continue
          }

          link.removeAttribute('aria-disabled')
          link.removeAttribute('tabindex')
          link.classList.remove(...DISABLED_LINK_CLASSES)
        }
      }

      syncLinkAvailability()
      window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncLinkAvailability)
      return () => {
        window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, syncLinkAvailability)
      }
    }, [active.length, mode, stale.length, timelineNavItems.length])

    if (mode === 'timeline') {
      return (
        <div className="relative">
          <ul>{timelineItems}</ul>
        </div>
      )
    }

    return (
      <div className="relative">
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
            <ul>{activeItems}</ul>
          </div>

          <div
            ref={staleListRef}
            className={`absolute inset-x-0 w-full will-change-transform ${transitionClasses} ${getListTransform(true)} ${getListOpacity(true)}`}
          >
            <ul>{staleItems}</ul>
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
      </div>
    )
  },
)
CharacterMenuList.displayName = 'CharacterMenuList'

export default CharacterMenuList
