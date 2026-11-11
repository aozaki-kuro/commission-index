// Single source of truth for the public web locale list.
// Order defines the locale switcher order; the first entry is the default locale.
// Adding a language: extend this array, then add src/pages/<locale>/index.astro.
export const WEB_LOCALES = ['en', 'zh-tw', 'ja'] as const
export type WebLocale = (typeof WEB_LOCALES)[number]

export const DEFAULT_WEB_LOCALE: WebLocale = 'en'

const WEB_LOCALE_SET = new Set<string>(WEB_LOCALES)

export function normalizeWebLocale(locale?: string | null): WebLocale {
  const normalized = locale?.toLowerCase() ?? DEFAULT_WEB_LOCALE
  return WEB_LOCALE_SET.has(normalized)
    ? (normalized as WebLocale)
    : DEFAULT_WEB_LOCALE
}
