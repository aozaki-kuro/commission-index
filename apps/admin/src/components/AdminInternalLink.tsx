import type { ReactNode } from 'react'
import { shouldHandleInternalNavigation } from '../lib/navigation'

interface AdminInternalLinkProps {
  href: string
  onNavigate: (path: string) => void
  className?: string
  children: ReactNode
}

export function AdminInternalLink({
  href,
  onNavigate,
  className,
  children,
}: AdminInternalLinkProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!shouldHandleInternalNavigation(event)) {
      return
    }

    event.preventDefault()
    onNavigate(href)
  }

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  )
}
