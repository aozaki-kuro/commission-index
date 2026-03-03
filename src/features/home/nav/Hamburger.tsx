import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import type { CharacterNavItem } from '#lib/characters/nav'
import { useCallback, useEffect, useRef, useState } from 'react'
import MenuContent, { preloadCharacterMenuList } from './hamburger/MenuContent'
import { MENU_TRANSITION_MS } from './hamburger/constants'
import type { CharacterEntry } from './hamburger/types'

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

interface HamburgerProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
  timelineNavItems: CharacterNavItem[]
}

const Hamburger = ({ active, stale, timelineNavItems }: HamburgerProps) => {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const openRafRef = useRef<number | null>(null)
  const hasTrackedUsageRef = useRef(false)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const clearOpenRaf = useCallback(() => {
    if (openRafRef.current !== null) {
      cancelAnimationFrame(openRafRef.current)
      openRafRef.current = null
    }
  }, [])

  const openMenu = useCallback(() => {
    preloadCharacterMenuList()

    if (!hasTrackedUsageRef.current) {
      hasTrackedUsageRef.current = true
      trackRybbitEvent(ANALYTICS_EVENTS.hamburgerMenuUsed, {
        active_count: active.length,
        stale_count: stale.length,
      })
    }
    clearCloseTimer()
    clearOpenRaf()
    setMounted(true)
    openRafRef.current = requestAnimationFrame(() => {
      setOpen(true)
      openRafRef.current = null
    })
  }, [active.length, clearCloseTimer, clearOpenRaf, stale.length])

  const close = useCallback(() => {
    clearOpenRaf()
    setOpen(false)
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false)
      closeTimerRef.current = null
    }, MENU_TRANSITION_MS)
  }, [clearCloseTimer, clearOpenRaf])

  const toggle = useCallback(() => {
    if (open) {
      close()
      return
    }
    openMenu()
  }, [close, open, openMenu])

  useEffect(() => {
    let timeoutId: number | null = null
    let idleId: number | null = null

    const preload = () => {
      preloadCharacterMenuList()
    }

    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(preload, { timeout: 1200 })
    } else {
      timeoutId = window.setTimeout(preload, 300)
    }

    return () => {
      if (idleId !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      clearCloseTimer()
      clearOpenRaf()
    }
  }, [clearCloseTimer, clearOpenRaf])

  return (
    <div className="fixed right-8 bottom-8 z-[90] flex flex-col items-end gap-3 md:hidden">
      <MenuContent
        mounted={mounted}
        open={open}
        close={close}
        toggle={toggle}
        active={active}
        stale={stale}
        timelineNavItems={timelineNavItems}
      />
    </div>
  )
}

export default Hamburger
