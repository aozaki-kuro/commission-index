'use client'

import AppLink from '#components/shared/AppLink'

type AdminSection = 'admin' | 'aliases'

interface AdminSectionNavProps {
  current: AdminSection
}

const AdminSectionNav = ({ current }: AdminSectionNavProps) => {
  const sectionLinks: Array<{ key: AdminSection; label: string; href: string }> = [
    { key: 'admin', label: 'Admin', href: '/admin' },
    { key: 'aliases', label: 'Aliases', href: '/admin/aliases' },
  ]

  return (
    <nav aria-label="Admin sections" className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        {sectionLinks.map(item =>
          item.key === current ? (
            <span
              key={item.key}
              aria-current="page"
              className="cursor-default text-gray-500 dark:text-gray-400"
            >
              {item.label}
            </span>
          ) : (
            <AppLink key={item.key} href={item.href}>
              {item.label}
            </AppLink>
          ),
        )}
      </div>

      <div className="flex items-center gap-4">
        <AppLink href="/">Home</AppLink>
      </div>
    </nav>
  )
}

export default AdminSectionNav
