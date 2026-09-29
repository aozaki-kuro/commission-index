import type { ErrorInfo, ReactNode } from 'react'
import { Component, lazy, startTransition, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { adminSections, getAdminSectionForPath, normalizeAdminPath } from './app/sections'
import { adminActionLinkStyles, adminSurfaceStyles } from './app/ui'
import { AdminInternalLink } from './components/AdminInternalLink'
import { AdminPageShell, AdminRootLayout } from './components/AdminLayout'
import { FloatingRebuildButton } from './components/FloatingRebuildButton'

const AdminOverviewPage = lazy(() => import('./pages/AdminOverviewPage').then(m => ({ default: m.AdminOverviewPage })))
const AdminCreatePage = lazy(() => import('./pages/AdminCreatePage').then(m => ({ default: m.AdminCreatePage })))
const AdminEditPage = lazy(() => import('./pages/AdminEditPage').then(m => ({ default: m.AdminEditPage })))
const AdminAliasesPage = lazy(() => import('./pages/AdminAliasesPage').then(m => ({ default: m.AdminAliasesPage })))
const AdminSuggestionPage = lazy(() => import('./pages/AdminSuggestionPage').then(m => ({ default: m.AdminSuggestionPage })))
const AdminPlaceholderPage = lazy(() => import('./pages/AdminPlaceholderPage').then(m => ({ default: m.AdminPlaceholderPage })))

function getPublicSiteUrl() {
  if (typeof window === 'undefined') {
    return 'https://crystallize.cc'
  }

  const { hostname, protocol } = window.location
  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    return 'http://localhost:4321'
  }

  if (hostname === 'admin.crystallize.cc') {
    return 'https://crystallize.cc'
  }

  return `${protocol}//${hostname}`
}

function getWindowScrollTop() {
  return Math.max(window.scrollY, window.pageYOffset, 0)
}

interface RouteLoadBoundaryProps {
  children: ReactNode
}

interface RouteLoadBoundaryState {
  error: Error | null
}

export class RouteLoadBoundary extends Component<RouteLoadBoundaryProps, RouteLoadBoundaryState> {
  state: RouteLoadBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteLoadBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Admin route failed to render.', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <section
          role="alert"
          className="mx-auto max-w-5xl space-y-4 rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-gray-950"
        >
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              This page could not be loaded.
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Reload the admin app to retry the page module.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:outline-none dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            Reload admin
          </button>
        </section>
      )
    }

    return this.props.children
  }
}

export function App() {
  const [currentPath, setCurrentPath] = useState(() => typeof window === 'undefined'
    ? '/'
    : normalizeAdminPath(window.location.pathname))
  const scrollPositionByPathRef = useRef(new Map<string, number>())
  const currentPathRef = useRef(currentPath)
  const currentSection = getAdminSectionForPath(currentPath)
  const publicSiteUrl = getPublicSiteUrl()

  useEffect(() => {
    currentPathRef.current = currentPath
  }, [currentPath])

  useEffect(() => {
    const pageTitle = currentSection ? currentSection.title : 'Not Found'
    document.title = `${pageTitle} | Commission Admin`
  }, [currentSection])

  const navigateTo = useCallback((nextPath: string, historyMode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined') {
      return
    }

    const previousPath = currentPathRef.current
    const normalizedPath = normalizeAdminPath(nextPath)
    if (normalizedPath === previousPath) {
      return
    }

    scrollPositionByPathRef.current.set(previousPath, getWindowScrollTop())

    if (historyMode === 'push') {
      window.history.pushState(null, '', normalizedPath)
    }
    else {
      window.history.replaceState(null, '', normalizedPath)
    }

    startTransition(() => {
      setCurrentPath(normalizedPath)
    })

    window.requestAnimationFrame(() => {
      const nextScrollTop = scrollPositionByPathRef.current.get(normalizedPath) ?? 0
      window.scrollTo({
        behavior: 'auto',
        top: nextScrollTop,
      })
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => {
      scrollPositionByPathRef.current.set(currentPathRef.current, getWindowScrollTop())

      const normalizedPath = normalizeAdminPath(window.location.pathname)
      startTransition(() => {
        setCurrentPath(normalizedPath)
      })

      window.requestAnimationFrame(() => {
        const nextScrollTop = scrollPositionByPathRef.current.get(normalizedPath) ?? 0
        window.scrollTo({
          behavior: 'auto',
          top: nextScrollTop,
        })
      })
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  if (!currentSection) {
    return (
      <AdminRootLayout>
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
              Not Found
            </h1>
            <p className="
              text-sm text-gray-600
              dark:text-gray-300
            "
            >
              This route is not part of the standalone admin shell.
            </p>
          </header>

          <section className={adminSurfaceStyles}>
            <h2 className="
              text-sm font-semibold text-gray-900
              dark:text-gray-100
            "
            >
              Available routes
            </h2>
            <div className="
              grid gap-3
              sm:grid-cols-2
            "
            >
              {adminSections.map(section => (
                <AdminInternalLink
                  key={section.key}
                  href={section.path}
                  onNavigate={navigateTo}
                  className={adminActionLinkStyles}
                >
                  {section.title}
                  <span aria-hidden="true">→</span>
                </AdminInternalLink>
              ))}
            </div>
            <a
              href={publicSiteUrl}
              className="
                inline-flex items-center gap-2 text-xs text-gray-600
                hover:text-gray-900
                dark:text-gray-300
                dark:hover:text-gray-100
              "
            >
              Open public site
              <span aria-hidden="true">↗</span>
            </a>
          </section>
        </div>
      </AdminRootLayout>
    )
  }

  const page = currentSection.key === 'overview'
    ? <AdminOverviewPage onNavigate={navigateTo} />
    : currentSection.key === 'create'
      ? <AdminCreatePage />
      : currentSection.key === 'edit'
        ? <AdminEditPage />
        : currentSection.key === 'aliases'
          ? <AdminAliasesPage />
          : currentSection.key === 'suggestion'
            ? <AdminSuggestionPage />
            : <AdminPlaceholderPage section={currentSection} />

  return (
    <AdminRootLayout>
      <AdminPageShell
        current={currentSection.key}
        title={currentSection.title}
        description={currentSection.description}
        onNavigate={navigateTo}
        publicSiteUrl={publicSiteUrl}
      >
        <RouteLoadBoundary key={currentPath}>
          <Suspense
            fallback={(
              <section
                aria-busy="true"
                aria-live="polite"
                className="mx-auto max-w-5xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950"
              >
                <p className="text-sm text-gray-600 dark:text-gray-300">Loading page…</p>
              </section>
            )}
          >
            {page}
          </Suspense>
        </RouteLoadBoundary>
      </AdminPageShell>
      <FloatingRebuildButton />
    </AdminRootLayout>
  )
}
