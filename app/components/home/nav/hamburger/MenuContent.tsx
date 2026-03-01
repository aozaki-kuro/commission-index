import { Button } from '#components/ui/button'
import { memo, useEffect, useState, type ComponentType } from 'react'
import { useCommissionViewMode } from '#components/home/commission/CommissionViewMode'
import type { CharacterNavItem } from '#lib/characters/nav'
import { STYLES } from './constants'
import { MenuIcon } from './Icons'
import type { CharacterEntry } from './types'

type CharacterMenuListProps = {
  active: CharacterEntry[]
  stale: CharacterEntry[]
  timelineNavItems: CharacterNavItem[]
  close: () => void
}

let cachedCharacterMenuList: ComponentType<CharacterMenuListProps> | null = null
let characterMenuListPromise: Promise<ComponentType<CharacterMenuListProps>> | null = null

const loadCharacterMenuList = async (): Promise<ComponentType<CharacterMenuListProps>> => {
  if (cachedCharacterMenuList) return cachedCharacterMenuList
  if (!characterMenuListPromise) {
    characterMenuListPromise = import('./CharacterMenuList').then(mod => {
      cachedCharacterMenuList = mod.default
      return mod.default
    })
  }

  return characterMenuListPromise
}

export const preloadCharacterMenuList = () => {
  void loadCharacterMenuList()
}

interface MenuContentProps {
  mounted: boolean
  open: boolean
  close: () => void
  toggle: () => void
  active: CharacterEntry[]
  stale: CharacterEntry[]
  timelineNavItems: CharacterNavItem[]
}

const MenuContent = memo(
  ({ mounted, open, close, toggle, active, stale, timelineNavItems }: MenuContentProps) => {
    const { mode } = useCommissionViewMode()
    const [CharacterMenuListComponent, setCharacterMenuListComponent] =
      useState<ComponentType<CharacterMenuListProps> | null>(() => cachedCharacterMenuList)

    useEffect(() => {
      const html = document.documentElement
      if (open) {
        html.classList.add('overflow-hidden', 'touch-none')
      } else {
        html.classList.remove('overflow-hidden', 'touch-none')
      }
      return () => html.classList.remove('overflow-hidden', 'touch-none')
    }, [open])

    useEffect(() => {
      if (!mounted || CharacterMenuListComponent) return
      void loadCharacterMenuList().then(component => {
        setCharacterMenuListComponent(() => component)
      })
    }, [CharacterMenuListComponent, mounted])

    const backdropStyle = {
      WebkitBackdropFilter: STYLES.backdrop,
      backdropFilter: STYLES.backdrop,
    } as const
    const menuTitle = mode === 'timeline' ? 'Years' : 'Characters'
    const loadingLabel = mode === 'timeline' ? 'years' : 'characters'

    return (
      <>
        {mounted && (
          <Button
            type="button"
            aria-label="Close navigation menu"
            className={`fixed inset-0 z-20 bg-gray-200/10 backdrop-blur-xs transition-opacity duration-200 dark:bg-gray-900/10 ${
              open ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            variant="ghost"
            size="icon"
            onClick={close}
          />
        )}

        <Button
          type="button"
          className={STYLES.floatingButton}
          style={backdropStyle}
          aria-expanded={open}
          aria-controls="mobile-character-menu"
          variant="ghost"
          size="icon"
          onClick={toggle}
        >
          <span className="sr-only">Open navigation menu</span>
          <MenuIcon isOpen={open} />
        </Button>

        {mounted ? (
          <div
            id="mobile-character-menu"
            aria-hidden={!open}
            className={`absolute right-4 bottom-full z-40 mb-4 max-h-[calc(100vh-8rem)] w-64 origin-bottom-right overflow-y-auto rounded-xl border border-white/20 bg-white/80 font-mono shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-lg transition-[opacity,transform] duration-220 ease-out focus:outline-hidden dark:bg-black/80 ${
              open ? 'translate-y-0 opacity-100' : 'pointer-events-none opacity-0'
            }`}
            style={backdropStyle}
          >
            <div className="border-b border-gray-300/50 p-4 dark:border-white/10">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{menuTitle}</h2>
            </div>
            <div className="p-2">
              {CharacterMenuListComponent ? (
                <CharacterMenuListComponent
                  active={active}
                  stale={stale}
                  timelineNavItems={timelineNavItems}
                  close={close}
                />
              ) : (
                <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  {`Loading ${loadingLabel}...`}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </>
    )
  },
)
MenuContent.displayName = 'MenuContent'

export default MenuContent
