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
    <div className="admin-workspace min-h-dvh text-sm/relaxed antialiased selection:bg-rose-200/40">
      <FloatingNoticeProvider>{children}</FloatingNoticeProvider>
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
    <div className="min-h-dvh lg:pl-52">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-gray-900 focus:p-3 focus:text-white">Skip to content</a>
      <AdminSectionNav current={current} onNavigate={onNavigate} publicSiteUrl={publicSiteUrl} />
      <main id="admin-content" tabIndex={-1} className="@container/workspace mx-auto max-w-[1600px] px-4 pt-6 pb-28 outline-none sm:px-8 sm:pt-8 lg:px-10">
        <header className="mb-6 border-b border-gray-200 pb-5 dark:border-gray-800">
          <h1 className="mb-2 text-[1.75rem]/9 font-medium tracking-tight text-gray-900 dark:text-gray-100">{title}</h1>
          <p className="max-w-2xl text-sm leading-[1.375rem] text-gray-600 dark:text-gray-400">{description}</p>
        </header>
        <div key={current} className="space-y-8 motion-safe:animate-[tabFade_240ms_ease-out]">
          {children}
        </div>
      </main>
    </div>
  )
}
