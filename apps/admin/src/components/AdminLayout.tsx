import type { ReactNode } from 'react'
import type { AdminSectionKey } from '../app/sections'
import { AdminSectionNav } from './AdminSectionNav'
import { FloatingNoticeProvider } from './FloatingNotice'

interface AdminRootLayoutProps {
  children: ReactNode
}

interface AdminPageShellProps {
  children: ReactNode
  current: AdminSectionKey
  title: string
  description: string
  onNavigate: (path: string) => void
  publicSiteUrl: string
}

export function AdminRootLayout({ children }: AdminRootLayoutProps) {
  return (
    <div className="
      min-h-dvh antialiased
      selection:bg-gray-400/25
      dark:bg-neutral-900
    "
    >
      <div className="
        mx-4 min-h-dvh max-w-2xl pt-7 pb-16 text-sm/relaxed
        sm:pt-20 sm:pb-32 sm:text-base
        md:mx-auto md:min-h-screen
      "
      >
        <FloatingNoticeProvider>{children}</FloatingNoticeProvider>
      </div>
    </div>
  )
}

export function AdminPageShell({
  children,
  current,
  title,
  description,
  onNavigate,
  publicSiteUrl,
}: AdminPageShellProps) {
  return (
    <div className="
      mx-auto max-w-5xl space-y-6 pt-6 pb-10
      md:px-4
      lg:px-0
    "
    >
      <header className="space-y-2">
        <h1 className="
          text-2xl/tight font-semibold text-gray-900
          dark:text-gray-100
        "
        >
          {title}
        </h1>
        <p className="
          text-sm text-gray-600
          dark:text-gray-300
        "
        >
          {description}
        </p>
      </header>

      <AdminSectionNav current={current} onNavigate={onNavigate} publicSiteUrl={publicSiteUrl} />

      <div
        key={current}
        className="space-y-8 motion-safe:animate-[tabFade_240ms_ease-out]"
      >
        {children}
      </div>
    </div>
  )
}
