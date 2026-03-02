import AppShell from './AppShell'
import { createBrowserRouter } from 'react-router-dom'
import Home from '#pages/home/HomePage'
import Support from '#pages/support/SupportPage'
import AdminPage from '#admin/AdminPage'
import AdminAliasesPage from '#admin/aliases/AliasesPage'
import NotFoundPage from '#components/shared/NotFoundPage'

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
        element: <Support />,
      },
      {
        path: 'admin',
        element: <AdminPage />,
      },
      {
        path: 'admin/aliases',
        element: <AdminAliasesPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

export default router
