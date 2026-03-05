export const HOME_LOCALES = ['en', 'ja', 'zh-Hant'] as const

export type HomeLocale = (typeof HOME_LOCALES)[number]

export interface HomeLocaleOption {
  locale: HomeLocale
  label: string
  shortLabel: string
  path: string
}

export const HOME_LOCALE_OPTIONS: readonly HomeLocaleOption[] = [
  { locale: 'en', label: 'English', shortLabel: 'EN', path: '/' },
  { locale: 'ja', label: '日本語', shortLabel: 'JP', path: '/ja' },
  { locale: 'zh-Hant', label: '繁體中文', shortLabel: '繁中', path: '/zh-hant' },
] as const

export const getHomeLocalePath = (locale: HomeLocale): string =>
  HOME_LOCALE_OPTIONS.find(option => option.locale === locale)?.path ?? '/'
