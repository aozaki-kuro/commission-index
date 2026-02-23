import { memo, useEffect, useState, type ComponentType } from 'react'
import { STYLES } from './constants'
import { MenuIcon } from './Icons'
import type { CharacterEntry } from './types'

type CharacterMenuListProps = {
  active: CharacterEntry[]
  stale: CharacterEntry[]
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
}

const MenuContent = memo(({ mounted, open, close, toggle, active, stale }: MenuContentProps) => {
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
        className={STYLES.floatingButton}
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
            open ? 'translate-y-0 opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={backdropStyle}
        >
          <div className="border-b border-gray-300/50 p-4 dark:border-white/10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Characters</h2>
          </div>
          <div className="p-2">
            {CharacterMenuListComponent ? (
              <CharacterMenuListComponent active={active} stale={stale} close={close} />
            ) : (
              <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                Loading characters...
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
})
MenuContent.displayName = 'MenuContent'

export default MenuContent
