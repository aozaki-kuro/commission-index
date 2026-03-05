import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover'
import {
  useHomeLocale,
  useHomeLocaleMessages,
  useHomeLocaleOptions,
} from '#features/home/i18n/HomeLocaleContext'
import { STYLES } from './constants'

interface LanguageFloatingMenuProps {
  hidden?: boolean
}

const TranslateIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
    <path d="m5 8 6 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m4 14 6-6 2-3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 5h12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 2h1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m22 22-5-10-5 10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 18h6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MENU_ITEM_BASE_CLASSES =
  'group flex w-full items-center justify-between rounded-lg px-4 py-1 font-mono text-sm !no-underline transition-colors duration-150'

const LanguageFloatingMenu = ({ hidden = false }: LanguageFloatingMenuProps) => {
  const locale = useHomeLocale()
  const localeOptions = useHomeLocaleOptions()
  const messages = useHomeLocaleMessages()
  const [openState, setOpenState] = useState(false)
  const backdropStyle = {
    WebkitBackdropFilter: STYLES.backdrop,
    backdropFilter: STYLES.backdrop,
  } as const

  return (
    <Popover
      open={hidden ? false : openState}
      onOpenChange={nextOpen => {
        if (hidden) return
        setOpenState(nextOpen)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={STYLES.floatingButton}
          style={backdropStyle}
          aria-label={messages.localeSwitcherLabel}
          disabled={hidden}
        >
          <TranslateIcon />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        sideOffset={12}
        style={backdropStyle}
        className="z-[95] w-48 rounded-xl border border-white/20 bg-white/80 p-2 font-mono shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:bg-black/80"
      >
        <ul className="space-y-1">
          {localeOptions.map(option => {
            const isActive = option.locale === locale
            return (
              <li key={option.locale}>
                <a
                  href={option.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`${MENU_ITEM_BASE_CLASSES} ${
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-white/10'
                  }`.trim()}
                >
                  <span>{option.label}</span>
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-gray-500/80 dark:bg-gray-300/80"
                    />
                  ) : null}
                </a>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export default LanguageFloatingMenu
