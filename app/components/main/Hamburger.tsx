'use client'

import { buildCharacterNavItems, CharacterNavItem } from '#lib/characters'
import { jumpToCommissionSearch } from '#lib/jumpToCommissionSearch'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface CharacterEntry {
  DisplayName: string
}

const STYLES = {
  menuButton:
    'relative z-30 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-[12px] transition-all duration-300 hover:bg-gray-100/80 hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] focus:outline-hidden dark:bg-black/80 dark:text-white dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] dark:ring-white/10 dark:hover:bg-gray-900/80 dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]',
  searchButton:
    'relative z-30 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-[12px] transition-all duration-300 hover:bg-gray-100/80 hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] focus:outline-hidden dark:bg-black/80 dark:text-white dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] dark:ring-white/10 dark:hover:bg-gray-900/80 dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]',
  listItem:
    'group flex w-full items-center rounded-lg px-4 py-2 font-mono text-base text-gray-900 !no-underline transition-colors duration-150 hover:bg-white/70 dark:text-white dark:hover:bg-white/10',
  toggleButton:
    'mt-2 flex w-full cursor-pointer items-center justify-between rounded-lg px-4 py-2 font-mono transition-colors duration-150 hover:bg-white/70 dark:hover:bg-white/10',
  backdrop: 'blur(12px)',
} as const

const MenuIcon = memo(({ isOpen }: { isOpen: boolean }) => (
  <svg
    className="h-5 w-5 transform transition-transform duration-300"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
  >
    {isOpen ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    ) : (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    )}
  </svg>
))
MenuIcon.displayName = 'MenuIcon'

const ChevronIcon = memo(({ isExpanded }: { isExpanded: boolean }) => (
  <svg
    className={`h-4 w-4 text-gray-600 transition-transform duration-200 dark:text-gray-300 ${
      isExpanded ? 'rotate-180' : ''
    }`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
))
ChevronIcon.displayName = 'ChevronIcon'

interface ListItemProps {
  item: CharacterNavItem
  close: () => void
}

const ListItem = memo(({ item, close }: ListItemProps) => {
  const href = `/${item.titleHash}`

  const handleClick = useCallback(() => {
    close()
  }, [close])

  return (
    <a href={href} onClick={handleClick} className={STYLES.listItem}>
      {item.displayName}
    </a>
  )
})
ListItem.displayName = 'ListItem'

interface CharacterListProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
  close: () => void
}

const CharacterList = memo(({ active, stale, close }: CharacterListProps) => {
  const [isStaleExpanded, setIsStaleExpanded] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isInitialRender, setIsInitialRender] = useState(true)
  const [containerHeight, setContainerHeight] = useState(0)

  const activeListRef = useRef<HTMLDivElement>(null)
  const staleListRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const measureContainer = useCallback(() => {
    const target = (isStaleExpanded ? staleListRef : activeListRef).current
    setContainerHeight(target?.scrollHeight ?? 0)
  }, [isStaleExpanded])

  // Keep height in sync with content size changes
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
  }, [measureContainer])

  useEffect(() => {
    const id = requestAnimationFrame(measureContainer)
    return () => cancelAnimationFrame(id)
  }, [measureContainer])

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
    const id = window.setTimeout(() => setIsAnimating(false), 300)
    return () => window.clearTimeout(id)
  }, [isAnimating])

  const activeNavItems = useMemo(() => buildCharacterNavItems(active), [active])
  const staleNavItems = useMemo(() => buildCharacterNavItems(stale), [stale])

  const activeItems = useMemo(
    () =>
      activeNavItems.map(item => (
        <li key={item.displayName}>
          <ListItem item={item} close={close} />
        </li>
      )),
    [activeNavItems, close],
  )

  const staleItems = useMemo(
    () =>
      staleNavItems.map(item => (
        <li key={item.displayName}>
          <ListItem item={item} close={close} />
        </li>
      )),
    [staleNavItems, close],
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

  return (
    <div className="relative">
      <div
        ref={containerRef}
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
})
CharacterList.displayName = 'CharacterList'

interface MenuContentProps {
  mounted: boolean
  open: boolean
  close: () => void
  toggle: () => void
  active: CharacterEntry[]
  stale: CharacterEntry[]
}

const MenuContent = memo(({ mounted, open, close, toggle, active, stale }: MenuContentProps) => {
  useEffect(() => {
    const html = document.documentElement
    if (open) {
      html.classList.add('overflow-hidden', 'touch-none')
    } else {
      html.classList.remove('overflow-hidden', 'touch-none')
    }
    return () => html.classList.remove('overflow-hidden', 'touch-none')
  }, [open])

  const backdropStyle = {
    WebkitBackdropFilter: STYLES.backdrop,
    backdropFilter: STYLES.backdrop,
  } as const

  return (
    <>
      {mounted && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className={`fixed inset-0 z-20 bg-gray-200/10 backdrop-blur-xs transition-opacity duration-200 dark:bg-gray-900/10 ${
            open ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={close}
        />
      )}

      <button
        type="button"
        className={STYLES.menuButton}
        style={backdropStyle}
        aria-expanded={open}
        aria-controls="mobile-character-menu"
        onClick={toggle}
      >
        <span className="sr-only">Open navigation menu</span>
        <MenuIcon isOpen={open} />
      </button>

      {mounted ? (
        <div
          id="mobile-character-menu"
          aria-hidden={!open}
          className={`absolute right-4 bottom-full z-40 mb-4 max-h-[calc(100vh-8rem)] w-64 origin-bottom-right overflow-y-auto rounded-xl border border-white/20 bg-white/80 font-mono shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-lg transition-[opacity,transform] duration-220 ease-out focus:outline-hidden dark:bg-black/80 ${
            open
              ? 'translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none translate-y-2 scale-95 opacity-0'
          }`}
          style={backdropStyle}
        >
          <div className="border-b border-gray-300/50 p-4 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Characters</h2>
          </div>
          <div className="p-2">
            <CharacterList active={active} stale={stale} close={close} />
          </div>
        </div>
      ) : null}
    </>
  )
})
MenuContent.displayName = 'MenuContent'

interface HamburgerProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
}

const Hamburger = ({ active, stale }: HamburgerProps) => {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openMenu = useCallback(() => {
    clearCloseTimer()
    setMounted(true)
    requestAnimationFrame(() => setOpen(true))
  }, [clearCloseTimer])

  const close = useCallback(() => {
    setOpen(false)
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false)
      closeTimerRef.current = null
    }, 220)
  }, [clearCloseTimer])

  const toggle = useCallback(() => {
    if (open) {
      close()
      return
    }
    openMenu()
  }, [close, open, openMenu])

  useEffect(() => {
    return () => clearCloseTimer()
  }, [clearCloseTimer])
  const jumpToSearch = useCallback(() => {
    jumpToCommissionSearch({ topGap: 40, focusMode: 'immediate' })
  }, [])

  return (
    <div className="fixed right-8 bottom-8 flex flex-col items-end gap-3 md:hidden">
      {!mounted ? (
        <button
          type="button"
          className={STYLES.searchButton}
          onClick={jumpToSearch}
          aria-label="Jump to search"
          title="Search"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
            <circle cx="11" cy="11" r="6" strokeWidth="2" />
          </svg>
        </button>
      ) : null}
      <MenuContent
        mounted={mounted}
        open={open}
        close={close}
        toggle={toggle}
        active={active}
        stale={stale}
      />
    </div>
  )
}

export default Hamburger
