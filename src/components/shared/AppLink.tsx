import { Link, useInRouterContext } from 'react-router-dom'
import { forwardRef, type AnchorHTMLAttributes } from 'react'

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  prefetch?: boolean
}

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, prefetch, ...props },
  ref,
) {
  void prefetch
  const inRouterContext = useInRouterContext()

  const isInternalPath = href.startsWith('/') && !href.startsWith('//')
  const shouldUseAnchor =
    !isInternalPath || Boolean(props.target) || Boolean(props.download) || !inRouterContext

  if (shouldUseAnchor) {
    return <a ref={ref} href={href} {...props} />
  }

  return <Link ref={ref} to={href} {...props} />
})

export default AppLink
