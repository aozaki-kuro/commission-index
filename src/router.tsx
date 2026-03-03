import AppShell from './AppShell'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { Suspense, lazy, type ReactNode } from 'react'
import Home from '#pages/home/HomePage'
import NotFoundPage from '#components/shared/NotFoundPage'

const Support = lazy(() => import('#pages/support/SupportPage'))

const withRouteSuspense = (element: ReactNode) => (
  <Suspense fallback={<div className="h-8" />}>{element}</Suspense>
)

const getAdminRoutes = (): RouteObject[] => {
  if (!import.meta.env?.DEV) return []

  const AdminPage = lazy(() => import('#admin/AdminPage'))
  const AdminAliasesPage = lazy(() => import('#admin/aliases/AliasesPage'))

  return [
    {
      path: 'admin',
      element: withRouteSuspense(<AdminPage />),
    },
    {
      path: 'admin/aliases',
      element: withRouteSuspense(<AdminAliasesPage />),
    },
  ]
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'support',
        element: withRouteSuspense(<Support />),
      },
      ...getAdminRoutes(),
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

export default router
