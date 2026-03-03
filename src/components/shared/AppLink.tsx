import * as ReactRouterDom from 'react-router-dom'
import { forwardRef, type AnchorHTMLAttributes } from 'react'

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  prefetch?: boolean
}

type RouterExports = {
  Link?: typeof import('react-router-dom').Link
  useInRouterContext?: () => boolean
  default?: {
    Link?: typeof import('react-router-dom').Link
    useInRouterContext?: () => boolean
  }
}

const routerExports = ReactRouterDom as unknown as RouterExports
const RouterLink = routerExports.Link ?? routerExports.default?.Link
const useResolvedRouterContextHook: () => boolean =
  routerExports.useInRouterContext ?? routerExports.default?.useInRouterContext ?? (() => false)

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, prefetch, ...props },
  ref,
) {
  void prefetch
  const inRouterContext = useResolvedRouterContextHook()

  const isInternalPath = href.startsWith('/') && !href.startsWith('//')
  const shouldUseAnchor =
    !isInternalPath ||
    Boolean(props.target) ||
    Boolean(props.download) ||
    !inRouterContext ||
    !RouterLink

  if (shouldUseAnchor) {
    return <a ref={ref} href={href} {...props} />
  }

  return <RouterLink ref={ref} to={href} {...props} />
})

export default AppLink
