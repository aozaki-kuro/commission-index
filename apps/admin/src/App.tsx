import type { ErrorInfo, ReactNode } from 'react'
import { Component, lazy, startTransition, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { adminSections, getAdminSectionForPath, normalizeAdminPath } from './app/sections'
import { adminActionLinkStyles, adminSurfaceStyles } from './app/ui'
import { AdminInternalLink } from './components/AdminInternalLink'
import { AdminPageShell, AdminRootLayout } from './components/AdminLayout'
import { FloatingNotice } from './components/FloatingNotice'
import { FloatingRebuildButton } from './components/FloatingRebuildButton'

const AdminOverviewPage = lazy(() => import('./pages/AdminOverviewPage').then(m => ({ default: m.AdminOverviewPage })))
const AdminCreatePage = lazy(() => import('./pages/AdminCreatePage').then(m => ({ default: m.AdminCreatePage })))
const AdminEditPage = lazy(() => import('./pages/AdminEditPage').then(m => ({ default: m.AdminEditPage })))
const AdminAliasesPage = lazy(() => import('./pages/AdminAliasesPage').then(m => ({ default: m.AdminAliasesPage })))
const AdminSuggestionPage = lazy(() => import('./pages/AdminSuggestionPage').then(m => ({ default: m.AdminSuggestionPage })))

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

function RouteLoadingNotice() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(setVisible, 200, true)
    return () => window.clearTimeout(timer)
  }, [])
  return visible ? <FloatingNotice>Loading page…</FloatingNotice> : null
}

function RouteContentReady({ onReady }: { onReady: () => void }) {
  useLayoutEffect(onReady, [onReady])
  return null
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
  const pendingScrollRef = useRef<{ path: string, top: number } | null>(null)
  const currentSection = getAdminSectionForPath(currentPath)
  const publicSiteUrl = getPublicSiteUrl()

  const handlePageReady = useCallback(() => {
    const pending = pendingScrollRef.current
    if (!pending || pending.path !== currentPath) {
      return
    }
    pendingScrollRef.current = null
    window.scrollTo({ behavior: 'auto', top: pending.top })
  }, [currentPath])

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
    pendingScrollRef.current = {
      path: normalizedPath,
      top: scrollPositionByPathRef.current.get(normalizedPath) ?? 0,
    }

    if (historyMode === 'push') {
      window.history.pushState(null, '', normalizedPath)
    }
    else {
      window.history.replaceState(null, '', normalizedPath)
    }

    startTransition(() => {
      setCurrentPath(normalizedPath)
    })
  }, [])

  useEffect(() => {
    // Edit 按数据锚点恢复；其余页面刷新时仍交给浏览器恢复原位置。
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = currentSection?.key === 'edit' ? 'manual' : 'auto'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [currentSection?.key])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => {
      scrollPositionByPathRef.current.set(currentPathRef.current, getWindowScrollTop())

      const normalizedPath = normalizeAdminPath(window.location.pathname)
      pendingScrollRef.current = {
        path: normalizedPath,
        top: scrollPositionByPathRef.current.get(normalizedPath) ?? 0,
      }
      startTransition(() => {
        setCurrentPath(normalizedPath)
      })
    }

    const cancelRestore = () => {
      pendingScrollRef.current = null
    }
    const cancelOnScrollKey = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
        cancelRestore()
    }
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('wheel', cancelRestore, { passive: true })
    window.addEventListener('touchmove', cancelRestore, { passive: true })
    window.addEventListener('keydown', cancelOnScrollKey)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('wheel', cancelRestore)
      window.removeEventListener('touchmove', cancelRestore)
      window.removeEventListener('keydown', cancelOnScrollKey)
    }
  }, [])

  if (!currentSection) {
    return (
      <AdminRootLayout>
        <RouteContentReady onReady={handlePageReady} />
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

  const page = {
    overview: <AdminOverviewPage onNavigate={navigateTo} />,
    create: <AdminCreatePage />,
    edit: <AdminEditPage onReady={handlePageReady} />,
    aliases: <AdminAliasesPage />,
    suggestion: <AdminSuggestionPage />,
  }[currentSection.key]

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
          <Suspense fallback={<RouteLoadingNotice />}>
            {page}
            {currentSection.key !== 'edit' && <RouteContentReady onReady={handlePageReady} />}
          </Suspense>
        </RouteLoadBoundary>
      </AdminPageShell>
      {currentSection.key !== 'overview' && <FloatingRebuildButton />}
    </AdminRootLayout>
  )
}
