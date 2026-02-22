'use client'

import Link from 'next/link'

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
            <Link key={item.key} href={item.href}>
              {item.label}
            </Link>
          ),
        )}
      </div>

      <div className="flex items-center gap-4">
        <Link href="/">Home</Link>
      </div>
    </nav>
  )
}

export default AdminSectionNav
