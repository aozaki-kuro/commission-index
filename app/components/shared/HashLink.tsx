'use client'

import { getHashFromHref, scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import Link from 'next/link'
import type { ComponentProps } from 'react'

type HashLinkProps = ComponentProps<typeof Link>

const HashLink = ({ href, onClick, ...props }: HashLinkProps) => {
  const hrefString = typeof href === 'string' ? href : null

  return (
    <Link
      href={href}
      onClick={event => {
        onClick?.(event)
        if (event.defaultPrevented || !hrefString) return

        const hash = getHashFromHref(hrefString)
        if (!hash.startsWith('#')) return

        const didScroll = scrollToHashTargetFromHrefWithoutHash(hrefString)
        if (!didScroll) return

        event.preventDefault()
        const { pathname, search } = window.location
        window.history.pushState(null, '', `${pathname}${search}${hash}`)
      }}
      {...props}
    />
  )
}

export default HashLink
