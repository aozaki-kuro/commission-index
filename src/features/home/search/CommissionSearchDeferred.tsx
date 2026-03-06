import { Suspense, lazy, startTransition, useCallback, useEffect, useState } from 'react'
import type { CommissionSearchEntrySource } from '#features/home/search/CommissionSearch'
import { useHomeLocaleMessages } from '#features/home/i18n/HomeLocaleContext'
import SearchShell from '#features/home/search/SearchShell'

const loadCommissionSearchModule = () => import('#features/home/search/CommissionSearch')
const CommissionSearch = lazy(loadCommissionSearchModule)

const HOME_SEARCH_INDEX_URL = '/search/home-search-entries.json'

let cachedHomeSearchEntries: CommissionSearchEntrySource[] | null = null
let homeSearchEntriesPromise: Promise<CommissionSearchEntrySource[]> | null = null
let commissionSearchModulePromise: Promise<unknown> | null = null

const prewarmCommissionSearchModule = () => {
  if (!commissionSearchModulePromise) {
    commissionSearchModulePromise = loadCommissionSearchModule()
  }
  return commissionSearchModulePromise
}

const hasSearchQueryParam = () => {
  if (typeof window === 'undefined') return false
  return !!new URLSearchParams(window.location.search).get('q')
}

type CommissionSearchShellProps = {
  query: string
  isLoadingEntries: boolean
  showLoadingPanel: boolean
  onPrewarm: () => void
  onActivate: (focusOnMount?: boolean, openHelpOnMount?: boolean) => void
  onQueryChange: (value: string) => void
}

const CommissionSearchShell = ({
  query,
  isLoadingEntries,
  showLoadingPanel,
  onPrewarm,
  onActivate,
  onQueryChange,
}: CommissionSearchShellProps) => (
  <CommissionSearchShellBody
    query={query}
    isLoadingEntries={isLoadingEntries}
    showLoadingPanel={showLoadingPanel}
    onPrewarm={onPrewarm}
    onActivate={onActivate}
    onQueryChange={onQueryChange}
  />
)

const CommissionSearchShellBody = ({
  query,
  isLoadingEntries,
  showLoadingPanel,
  onPrewarm,
  onActivate,
  onQueryChange,
}: CommissionSearchShellProps) => {
  const { controls } = useHomeLocaleMessages()

  return (
    <SearchShell
      query={query}
      onQueryChange={onQueryChange}
      searchLabel={controls.searchCommissions}
      searchPlaceholder={controls.searchPlaceholder}
      searchHelpLabel={controls.searchHelp}
      loadingLabel={isLoadingEntries ? '...' : null}
      showLoadingPanel={showLoadingPanel}
      onPrewarm={onPrewarm}
      onActivate={onActivate}
      onHelpPointerDown={event => {
        // Activate on pointer down to avoid a residual click toggling the mounted trigger.
        event.preventDefault()
        onActivate(false, true)
      }}
      onHelpClick={event => {
        // Keyboard activation still fires click without a preceding pointer event.
        if (event.detail !== 0) return
        onActivate(false, true)
      }}
    />
  )
}

export default function CommissionSearchDeferred() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [shouldFocusOnMount, setShouldFocusOnMount] = useState(false)
  const [shouldOpenHelpOnMount, setShouldOpenHelpOnMount] = useState(false)
  const [shellQuery, setShellQuery] = useState('')
  const [externalEntries, setExternalEntries] = useState<CommissionSearchEntrySource[] | null>(null)
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)

  const shouldLoadExternalEntries = Boolean(import.meta.env?.PROD)
  const shouldPrewarmModule = !import.meta.env?.TEST

  const loadExternalEntries = useCallback(async () => {
    if (!shouldLoadExternalEntries) return externalEntries
    if (externalEntries) return externalEntries
    if (cachedHomeSearchEntries) {
      setExternalEntries(cachedHomeSearchEntries)
      return cachedHomeSearchEntries
    }

    setIsLoadingEntries(true)
    try {
      if (!homeSearchEntriesPromise) {
        homeSearchEntriesPromise = fetch(HOME_SEARCH_INDEX_URL)
          .then(async response => {
            if (!response.ok) {
              throw new Error(`Failed to load search index: ${response.status}`)
            }
            return (await response.json()) as CommissionSearchEntrySource[]
          })
          .then(entries => {
            cachedHomeSearchEntries = entries
            return entries
          })
          .catch(error => {
            homeSearchEntriesPromise = null
            throw error
          })
      }

      const entries = await homeSearchEntriesPromise
      setExternalEntries(entries)
      return entries
    } finally {
      setIsLoadingEntries(false)
    }
  }, [externalEntries, shouldLoadExternalEntries])

  const enableSearch = useCallback(
    (focusOnMount = false, openHelpOnMount = false) => {
      const shouldEnable = !isEnabled
      const shouldMarkFocusOnMount = focusOnMount && !shouldFocusOnMount
      const shouldMarkHelpOnMount = openHelpOnMount && !shouldOpenHelpOnMount
      const requiresSynchronousFocusPath = focusOnMount || openHelpOnMount

      if (requiresSynchronousFocusPath) {
        if (shouldEnable) setIsEnabled(true)
        if (shouldMarkFocusOnMount) setShouldFocusOnMount(true)
        if (shouldMarkHelpOnMount) setShouldOpenHelpOnMount(true)
      } else if (shouldEnable || shouldMarkFocusOnMount || shouldMarkHelpOnMount) {
        startTransition(() => {
          if (shouldEnable) setIsEnabled(true)
          if (shouldMarkFocusOnMount) setShouldFocusOnMount(true)
          if (shouldMarkHelpOnMount) setShouldOpenHelpOnMount(true)
        })
      }

      const shouldRequestEntries =
        shouldLoadExternalEntries &&
        !externalEntries &&
        !cachedHomeSearchEntries &&
        !homeSearchEntriesPromise

      if (shouldEnable && shouldPrewarmModule) {
        void prewarmCommissionSearchModule()
      }

      if (shouldEnable || shouldRequestEntries) {
        void loadExternalEntries()
      }
    },
    [
      externalEntries,
      isEnabled,
      loadExternalEntries,
      shouldFocusOnMount,
      shouldLoadExternalEntries,
      shouldOpenHelpOnMount,
      shouldPrewarmModule,
    ],
  )

  const prewarmSearch = useCallback(() => {
    if (shouldPrewarmModule) {
      void prewarmCommissionSearchModule()
    }

    const shouldRequestEntries =
      shouldLoadExternalEntries &&
      !externalEntries &&
      !cachedHomeSearchEntries &&
      !homeSearchEntriesPromise
    if (shouldRequestEntries) {
      void loadExternalEntries()
    }
  }, [externalEntries, loadExternalEntries, shouldLoadExternalEntries, shouldPrewarmModule])

  useEffect(() => {
    if (isEnabled || !hasSearchQueryParam()) return
    enableSearch(false)
  }, [enableSearch, isEnabled])

  useEffect(() => {
    if (isEnabled || (!shouldLoadExternalEntries && !shouldPrewarmModule)) return

    const win = window as Window & {
      requestIdleCallback?: (
        callback: (deadline?: unknown) => void,
        options?: { timeout: number },
      ) => number
      cancelIdleCallback?: (id: number) => void
    }

    const runPrewarm = () => {
      prewarmSearch()
    }

    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(() => runPrewarm(), { timeout: 1200 })
      return () => {
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId)
        }
      }
    }

    const timeoutId = window.setTimeout(runPrewarm, 320)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isEnabled, prewarmSearch, shouldLoadExternalEntries, shouldPrewarmModule])

  const isSearchReady = !shouldLoadExternalEntries || !!externalEntries

  const shell = (
    <CommissionSearchShell
      query={shellQuery}
      isLoadingEntries={isEnabled && isLoadingEntries}
      showLoadingPanel={isEnabled}
      onPrewarm={prewarmSearch}
      onActivate={enableSearch}
      onQueryChange={setShellQuery}
    />
  )

  if (isEnabled && isSearchReady) {
    return (
      <Suspense fallback={shell}>
        <CommissionSearch
          autoFocusOnMount={shouldFocusOnMount}
          deferIndexInit
          externalEntries={externalEntries ?? undefined}
          initialQuery={shellQuery || undefined}
          openHelpOnMount={shouldOpenHelpOnMount}
        />
      </Suspense>
    )
  }

  return shell
}
