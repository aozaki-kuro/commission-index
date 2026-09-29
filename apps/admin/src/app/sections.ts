export type AdminSectionKey = 'overview' | 'create' | 'edit' | 'aliases' | 'suggestion'

export interface AdminSectionDefinition {
  key: AdminSectionKey
  label: string
  path: string
  title: string
  description: string
}

export const adminSections: AdminSectionDefinition[] = [
  {
    key: 'overview',
    label: 'Overview',
    path: '/',
    title: 'Admin Overview',
    description: 'Create, maintain, and publish your collection.',
  },
  {
    key: 'create',
    label: 'Create',
    path: '/create',
    title: 'Create',
    description: 'Add artwork and its delivery details.',
  },
  {
    key: 'edit',
    label: 'Edit',
    path: '/edit',
    title: 'Edit',
    description: 'Search, reorder, rename, and maintain existing commission records.',
  },
  {
    key: 'aliases',
    label: 'Aliases',
    path: '/aliases',
    title: 'Aliases',
    description: 'Connect alternate names and keywords for search.',
  },
  {
    key: 'suggestion',
    label: 'Suggestion',
    path: '/suggestion',
    title: 'Suggestion',
    description: 'Choose the keywords visitors see first on the home page.',
  },
]

const sectionByPath = new Map(adminSections.map(section => [section.path, section]))

export function normalizeAdminPath(pathname: string) {
  if (!pathname || pathname === '/') {
    return '/'
  }

  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

export function getAdminSectionForPath(pathname: string) {
  return sectionByPath.get(normalizeAdminPath(pathname)) ?? null
}
