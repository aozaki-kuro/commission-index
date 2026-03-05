import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover'
import {
  useHomeLocale,
  useHomeLocaleMessages,
  useHomeLocaleOptions,
} from '#features/home/i18n/HomeLocaleContext'

const TRIGGER_CLASSES =
  'group relative flex min-h-5 items-center pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white'
const TRIGGER_TEXT_CLASSES =
  'font-mono text-sm leading-5 font-bold text-gray-700 no-underline transition-colors duration-200 group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white'
const GLASS_STYLE = {
  WebkitBackdropFilter: 'blur(12px)',
  backdropFilter: 'blur(12px)',
} as const
const MENU_ITEM_BASE_CLASSES =
  'group flex w-full items-center justify-between rounded-lg px-4 py-1 font-mono text-sm !no-underline transition-colors duration-150'

const TriangleDownIcon = () => (
  <svg
    viewBox="0 0 12 12"
    className="absolute top-1/2 left-0 h-3 w-3 -translate-x-1 -translate-y-1/2 text-gray-400 transition-colors duration-200 group-hover:text-gray-500 dark:group-hover:text-gray-300"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M2 4h8L6 9z" />
  </svg>
)

const LocalePopoverMenu = () => {
  const locale = useHomeLocale()
  const localeOptions = useHomeLocaleOptions()
  const messages = useHomeLocaleMessages()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-link-style="true"
          className={`${TRIGGER_CLASSES} w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left no-underline`}
          aria-label={messages.localeSwitcherLabel}
        >
          <TriangleDownIcon />
          <span className={TRIGGER_TEXT_CLASSES}>{messages.localeSwitcherLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={10}
        style={GLASS_STYLE}
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

export default LocalePopoverMenu
