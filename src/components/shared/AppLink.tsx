import { forwardRef, type AnchorHTMLAttributes } from 'react'

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, ...props },
  ref,
) {
  return <a ref={ref} href={href} {...props} />
})

export default AppLink
