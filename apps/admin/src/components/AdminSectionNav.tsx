import type { AdminSectionKey } from '../app/sections'
import { IconArrowUpRight, IconHome, IconListDetails, IconPlus, IconSearch, IconTags } from '@tabler/icons-react'
import { adminSections } from '../app/sections'
import { AdminInternalLink } from './AdminInternalLink'

interface AdminSectionNavProps {
  current: AdminSectionKey
  onNavigate: (path: string) => void
  publicSiteUrl: string
}

export function AdminSectionNav({ current, onNavigate, publicSiteUrl }: AdminSectionNavProps) {
  const icons = { overview: IconHome, create: IconPlus, edit: IconListDetails, aliases: IconTags, suggestion: IconSearch }
  return (
    <nav
      aria-label="Admin sections"
      className="admin-navigation border-b border-gray-200 px-4 pt-5 pb-3 sm:px-8 lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-52 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-5 lg:pt-8 lg:pb-6 dark:border-gray-800"
    >
      <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3 lg:mb-8">
        <div>
          <p className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            <span aria-hidden="true" className="size-2 rounded-full bg-rose-400" />
            Commission Index
          </p>
          <p className="mt-0.5 pl-[18px] text-xs text-gray-500 dark:text-gray-400">Private collection</p>
        </div>
        <a href={publicSiteUrl} className="inline-flex min-h-11 items-center gap-1 text-xs no-underline lg:hidden">
          Public Site
          <IconArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      <div className="grid shrink-0 grid-cols-5 gap-1 lg:flex lg:flex-col lg:gap-1.5">
        {adminSections.map((item) => {
          const Icon = icons[item.key]
          const content = (
            <>
              <Icon className="size-[18px] shrink-0" stroke={1.6} aria-hidden="true" />
              <span>{item.label}</span>
            </>
          )
          return (
            item.key === current
              ? (
                  <span
                    key={item.key}
                    aria-current="page"
                    className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md bg-gray-200/65 px-1 text-[11px] font-semibold text-gray-950 sm:text-xs lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm dark:bg-gray-800 dark:text-gray-100"
                  >
                    {content}
                  </span>
                )
              : (
                  <AdminInternalLink
                    key={item.key}
                    href={item.path}
                    onNavigate={onNavigate}
                    className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-normal text-gray-600 no-underline transition-colors hover:bg-gray-200/40 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-xs lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    {content}
                  </AdminInternalLink>
                )
          )
        })}
      </div>

      <div className="mt-auto hidden shrink-0 border-t border-gray-200 pt-5 lg:block dark:border-gray-800">
        <a href={publicSiteUrl} className="flex min-h-11 items-center justify-between px-3 text-sm text-gray-600 no-underline dark:text-gray-400">
          Public Site
          <IconArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </div>
    </nav>
  )
}
