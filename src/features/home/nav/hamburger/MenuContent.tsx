import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import {
  useCommissionViewMode,
  type CommissionViewMode,
} from '#features/home/commission/CommissionViewMode'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import type { CharacterNavItem } from '#lib/characters/nav'
import { jumpToCommissionSearch } from '#lib/navigation/jumpToCommissionSearch'
import { SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem } from '#components/ui/sidebar'
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

const UTILITY_ROW_WRAPPER_CLASSES =
  'flex w-full items-center justify-between rounded-lg px-4 py-1 text-gray-700 transition-colors duration-150 hover:bg-white/70 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-white'
const UTILITY_ROW_TEXT_CLASSES =
  'font-mono text-base leading-6 font-bold no-underline transition-colors duration-200'
const VIEW_MODE_TOGGLE_ITEMS = [
  { mode: 'character' as CommissionViewMode, label: 'By Character' },
  { mode: 'timeline' as CommissionViewMode, label: 'By Date' },
] as const

interface UtilityActionButtonProps {
  label: string
  icon?: ReactNode
  active: boolean
  onClick: () => void
}

const UtilityActionButton = ({ label, icon, active, onClick }: UtilityActionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    data-link-style="true"
    className={`${UTILITY_ROW_WRAPPER_CLASSES} cursor-pointer appearance-none border-0 bg-transparent p-0 text-left no-underline ${
      active ? 'text-gray-900 dark:text-white' : ''
    }`.trim()}
  >
    <span className={UTILITY_ROW_TEXT_CLASSES}>{label}</span>
    {icon ? (
      icon
    ) : (
      <span
        className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
          active ? 'scale-100 bg-gray-500 opacity-100' : 'scale-0 opacity-0'
        }`}
        aria-hidden="true"
      />
    )}
  </button>
)

const MenuContent = memo(
  ({ mounted, open, close, toggle, active, stale, timelineNavItems }: MenuContentProps) => {
    const { mode, setMode } = useCommissionViewMode()
    const hasTrackedHamburgerSearchUsageRef = useRef(false)
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

    const handleSearchClick = useCallback(() => {
      if (!hasTrackedHamburgerSearchUsageRef.current) {
        hasTrackedHamburgerSearchUsageRef.current = true
        trackRybbitEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
          source: 'search_link',
          nav_surface: 'hamburger',
          view_mode: mode,
          item_count: mode === 'timeline' ? timelineNavItems.length : active.length + stale.length,
        })
      }
      jumpToCommissionSearch({ topGap: 40, focusMode: 'immediate' })
      close()
    }, [active.length, close, mode, stale.length, timelineNavItems.length])

    const handleModeChange = useCallback(
      (nextMode: CommissionViewMode) => {
        trackRybbitEvent(ANALYTICS_EVENTS.sidebarViewModeToggleUsed, {
          from_mode: mode,
          to_mode: nextMode,
          already_active: mode === nextMode,
        })
        setMode(nextMode)
      },
      [mode, setMode],
    )

    const backdropStyle = {
      WebkitBackdropFilter: STYLES.backdrop,
      backdropFilter: STYLES.backdrop,
    } as const
    const loadingLabel = mode === 'timeline' ? 'years' : 'characters'

    return (
      <>
        {mounted && (
          <button
            type="button"
            aria-label="Close navigation menu"
            className={`fixed inset-0 z-60 bg-gray-200/10 backdrop-blur-xs transition-opacity duration-200 dark:bg-gray-900/10 ${
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
            className={`absolute right-4 bottom-full z-80 mb-4 max-h-[calc(100vh-8rem)] w-64 origin-bottom-right overflow-y-auto rounded-xl border border-white/20 bg-white/80 font-mono shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-lg transition-[opacity,transform] duration-220 ease-out focus:outline-hidden dark:bg-black/80 ${
              open ? 'translate-y-0 opacity-100' : 'pointer-events-none opacity-0'
            }`}
            style={backdropStyle}
          >
            <SidebarContent className="space-y-0">
              <SidebarGroup className="space-y-1.5 border-b border-gray-300/50 px-2 py-3 dark:border-white/10">
                <SidebarMenu className="space-y-1.5">
                  <SidebarMenuItem>
                    <UtilityActionButton
                      label="Search"
                      active
                      onClick={handleSearchClick}
                      icon={
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5 text-gray-500 transition-colors"
                          fill="none"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m21 21-4.4-4.4"
                          />
                          <circle cx="11" cy="11" r="6" strokeWidth="2" />
                        </svg>
                      }
                    />
                  </SidebarMenuItem>

                  {VIEW_MODE_TOGGLE_ITEMS.map(item => (
                    <SidebarMenuItem key={item.mode}>
                      <UtilityActionButton
                        label={item.label}
                        active={mode === item.mode}
                        onClick={() => handleModeChange(item.mode)}
                      />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>

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
            </SidebarContent>
          </div>
        ) : null}
      </>
    )
  },
)
MenuContent.displayName = 'MenuContent'

export default MenuContent
