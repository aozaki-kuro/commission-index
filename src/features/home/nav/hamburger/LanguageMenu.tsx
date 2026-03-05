import {
  getHomeLocalePath,
  HOME_LOCALE_OPTIONS,
  type HomeLocale,
} from '#features/home/i18n/homeLocale'
import { useMemo, useState } from 'react'
import { STYLES } from './constants'

interface LanguageMenuProps {
  locale: HomeLocale
}

const LanguageMenu = ({ locale }: LanguageMenuProps) => {
  const [open, setOpen] = useState(false)
  const currentLocale = useMemo(
    () => HOME_LOCALE_OPTIONS.find(option => option.locale === locale) ?? HOME_LOCALE_OPTIONS[0],
    [locale],
  )

  const backdropStyle = {
    WebkitBackdropFilter: STYLES.backdrop,
    backdropFilter: STYLES.backdrop,
  } as const

  return (
    <div className="relative">
      <button
        type="button"
        className={STYLES.floatingButton}
        style={backdropStyle}
        aria-expanded={open}
        aria-controls="mobile-language-menu"
        onClick={() => setOpen(value => !value)}
      >
        <span className="sr-only">Open language menu</span>
        <span className="flex items-center gap-1 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M3 12h18" />
            <path
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"
            />
          </svg>
          {currentLocale.shortLabel}
        </span>
      </button>

      <div
        id="mobile-language-menu"
        aria-hidden={!open}
        className={`absolute right-0 bottom-full z-80 mb-3 w-36 overflow-hidden rounded-xl border border-white/25 bg-white/80 p-1 font-mono shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-[opacity,transform] duration-220 ease-out dark:bg-black/80 ${
          open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
        }`}
        style={backdropStyle}
      >
        {HOME_LOCALE_OPTIONS.map(option => (
          <button
            key={option.locale}
            type="button"
            onClick={() => window.location.assign(getHomeLocalePath(option.locale))}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              option.locale === locale
                ? 'bg-gray-900/10 text-gray-900 dark:bg-white/15 dark:text-white'
                : 'text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-white/10'
            }`}
          >
            {option.label}
            {option.locale === locale ? (
              <span className="h-1.5 w-1.5 rounded-full bg-gray-500 dark:bg-gray-300" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

export default LanguageMenu
