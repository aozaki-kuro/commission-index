import { createContext, useContext, type ReactNode } from 'react'
import {
  DEFAULT_HOME_LOCALE,
  HOME_LOCALE_SWITCH_ITEMS,
  getHomeLocaleMessages,
  normalizeHomeLocale,
  type HomeLocale,
} from '#features/home/i18n/homeLocale'

export interface HomeLocaleOption {
  locale: HomeLocale
  label: string
  href: string
}

type HomeLocaleContextValue = {
  locale: HomeLocale
  options: HomeLocaleOption[]
}

const defaultOptions: HomeLocaleOption[] = HOME_LOCALE_SWITCH_ITEMS.map(item => ({
  locale: item.locale,
  label: item.label,
  href: item.locale === DEFAULT_HOME_LOCALE ? '/' : `/${item.locale}/`,
}))

const HomeLocaleContext = createContext<HomeLocaleContextValue>({
  locale: DEFAULT_HOME_LOCALE,
  options: defaultOptions,
})

export const HomeLocaleProvider = ({
  locale,
  options,
  children,
}: {
  locale?: string
  options?: HomeLocaleOption[]
  children: ReactNode
}) => {
  const normalizedLocale = normalizeHomeLocale(locale)

  return (
    <HomeLocaleContext.Provider
      value={{ locale: normalizedLocale, options: options ?? defaultOptions }}
    >
      {children}
    </HomeLocaleContext.Provider>
  )
}

export const useHomeLocale = () => useContext(HomeLocaleContext).locale
export const useHomeLocaleOptions = () => useContext(HomeLocaleContext).options

export const useHomeLocaleMessages = () => getHomeLocaleMessages(useHomeLocale())
