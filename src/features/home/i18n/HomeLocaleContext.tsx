import { createContext, useContext, type ReactNode } from 'react'
import {
  DEFAULT_HOME_LOCALE,
  getHomeLocaleMessages,
  normalizeHomeLocale,
  type HomeLocale,
} from '#features/home/i18n/homeLocale'

export interface HomeLocaleOption {
  locale: HomeLocale
  label: string
  href: string
}

const HomeLocaleContext = createContext<HomeLocale>(DEFAULT_HOME_LOCALE)

export const HomeLocaleProvider = ({
  locale,
  children,
}: {
  locale?: string
  children: ReactNode
}) => {
  const normalizedLocale = normalizeHomeLocale(locale)

  return (
    <HomeLocaleContext.Provider value={normalizedLocale}>{children}</HomeLocaleContext.Provider>
  )
}

export const useHomeLocale = () => useContext(HomeLocaleContext)

export const useHomeLocaleMessages = () => getHomeLocaleMessages(useHomeLocale())
