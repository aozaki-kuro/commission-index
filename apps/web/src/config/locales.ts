// Single source of truth for the public web locale list.
// Order defines the locale switcher order; the first entry is the default locale.
// Adding a language: extend this array, then add src/pages/<locale>/index.astro.
export const WEB_LOCALES = ['en', 'zh-tw', 'ja'] as const
export type WebLocale = (typeof WEB_LOCALES)[number]

export const DEFAULT_WEB_LOCALE: WebLocale = 'en'
