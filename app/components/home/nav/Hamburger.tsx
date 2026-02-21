'use client'

import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { useCallback, useEffect, useRef, useState } from 'react'
import MenuContent from './hamburger/MenuContent'
import { MENU_TRANSITION_MS } from './hamburger/constants'
import SearchJumpButton from './hamburger/SearchJumpButton'
import type { CharacterEntry } from './hamburger/types'

interface HamburgerProps {
  active: CharacterEntry[]
  stale: CharacterEntry[]
}

const Hamburger = ({ active, stale }: HamburgerProps) => {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const openRafRef = useRef<number | null>(null)

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
    clearCloseTimer()
    clearOpenRaf()
    setMounted(true)
    openRafRef.current = requestAnimationFrame(() => {
      setOpen(true)
      openRafRef.current = null
    })
  }, [clearCloseTimer, clearOpenRaf])

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
    return () => {
      clearCloseTimer()
      clearOpenRaf()
    }
  }, [clearCloseTimer, clearOpenRaf])

  const jumpToSearch = useCallback(() => {
    jumpToCommissionSearch({ topGap: 40, focusMode: 'immediate' })
  }, [])

  return (
    <div className="fixed right-8 bottom-8 flex flex-col items-end gap-3 md:hidden">
      {!mounted ? <SearchJumpButton onClick={jumpToSearch} /> : null}
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
