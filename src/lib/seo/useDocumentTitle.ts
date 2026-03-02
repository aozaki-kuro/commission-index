import { SiteMeta } from '#config/siteMeta'
import { useEffect } from 'react'

const buildTitle = (pageTitle?: string) => {
  if (!pageTitle) return SiteMeta.site
  return `${pageTitle} | ${SiteMeta.site}`
}

export const useDocumentTitle = (pageTitle?: string) => {
  useEffect(() => {
    document.title = buildTitle(pageTitle)
  }, [pageTitle])
}
