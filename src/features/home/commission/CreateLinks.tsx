import AppLink from '#components/shared/AppLink'
import { selectDisplayLinks, type DisplayLinksInput } from './linkDisplay'

export { COMMISSION_LINK_TEXT_CLASS, hasDisplayableLinks } from './linkDisplay'

export const createLinks = ({ links, designLink }: DisplayLinksInput) => {
  const { mainLinks, designLink: normalizedDesignLink } = selectDisplayLinks({ links, designLink })

  const mainLinkElements = mainLinks.map(({ type, url }, index) => (
    <span key={type} className={index > 0 ? 'ml-2 md:ml-3' : ''}>
      <AppLink href={url} className="underline underline-offset-2 select-none" target="_blank">
        {type}
      </AppLink>
    </span>
  ))

  const designElement = normalizedDesignLink ? (
    <span key="Design" className={mainLinkElements.length > 0 ? 'ml-2 md:ml-3' : ''}>
      <AppLink
        href={normalizedDesignLink}
        className="underline underline-offset-2 select-none"
        target="_blank"
      >
        Design
      </AppLink>
    </span>
  ) : null

  const combined = designElement ? [...mainLinkElements, designElement] : mainLinkElements

  if (combined.length === 0) {
    return [<span key="error">N/A</span>]
  }

  return combined
}
