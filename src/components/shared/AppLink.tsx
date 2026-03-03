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
  return <a ref={ref} href={href} {...props} />
})

export default AppLink
