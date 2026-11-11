import type { AdminCommissionSearchRow } from '@commission-index/domain'
import type { KeyboardEvent, ReactNode } from 'react'
import type { AdminOverviewPayload } from '../lib/adminApi'
import { IconPencil } from '@tabler/icons-react'
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { buttonStyles } from '../app/ui'
import { AdminBootstrapStatus } from '../components/AdminBootstrapStatus'
import { FloatingNotice } from '../components/FloatingNotice'
import { AdminAnalyticsNotConfiguredError, fetchAdminInterest, fetchAdminLinkClicks, fetchAdminOverviewPayload, getAdminApiBaseUrl, getAdminApiUrl, readCachedAdminJson } from '../lib/adminApi'
import { compareCommissionsByDate, formatCommissionPublicId, getCommissionAccessibleLabel, getCommissionTitle } from '../lib/commissionPresentation'
import { requestCommissionEdit } from '../lib/editIntent'
import { isPendingRebuild, subscribeToPendingRebuild } from '../lib/pendingRebuildSignal'
import { rankPopularCommissions } from '../lib/popularCommissions'
import { rankUnpublishedInterest } from '../lib/unpublishedInterest'
import { dismissWebsiteRebuildNotice, getServerWebsiteRebuildState, getWebsiteRebuildState, queueWebsiteRebuild, subscribeToWebsiteRebuild } from '../lib/websiteRebuild'

interface OverviewState {
  errorMessage: string | null
  isLoading: boolean
  payload: AdminOverviewPayload | null
}

type OverviewAction
  = { type: 'loading' }
    | { type: 'loaded', payload: AdminOverviewPayload }
    | { type: 'failed', message: string }

function createInitialOverviewState(): OverviewState {
  const payload = readCachedAdminJson<AdminOverviewPayload>('/api/admin/overview')
  return { payload, errorMessage: null, isLoading: payload === null }
}

function overviewReducer(state: OverviewState, action: OverviewAction): OverviewState {
  switch (action.type) {
    case 'loading': return { ...state, isLoading: true, errorMessage: null }
    case 'loaded': return { payload: action.payload, isLoading: false, errorMessage: null }
    case 'failed': return { ...state, errorMessage: action.message, isLoading: false }
  }
}

type AnalyticsStatus = 'loading' | 'ready' | 'not-connected' | 'error'

interface AnalyticsState<T> {
  status: AnalyticsStatus
  payload: T | null
}

type AnalyticsAction<T>
  = { type: 'loading' }
    | { type: 'loaded', payload: T }
    | { type: 'failed', status: 'not-connected' | 'error' }

function analyticsReducer<T>(state: AnalyticsState<T>, action: AnalyticsAction<T>): AnalyticsState<T> {
  switch (action.type) {
    // A cached ranking stays visible while it refreshes in the background.
    case 'loading': return state.payload
      ? state
      : { ...state, status: 'loading' }
    case 'loaded': return { status: 'ready', payload: action.payload }
    case 'failed': return { ...state, status: action.status }
  }
}

// Independent of the overview payload: a missing analytics key or a Rybbit outage must not fail the page.
function useAnalyticsFeed<T>(pathname: string, load: (signal: AbortSignal) => Promise<T>, reloadToken: number) {
  const [state, dispatch] = useReducer(analyticsReducer<T>, pathname, (cachePath): AnalyticsState<T> => {
    const payload = readCachedAdminJson<T>(cachePath)
    return {
      status: payload ? 'ready' : 'loading',
      payload,
    }
  })
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    dispatch({ type: 'loading' })
    void load(controller.signal)
      .then((payload) => {
        if (!controller.signal.aborted)
          dispatch({ type: 'loaded', payload })
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'failed',
            status: error instanceof AdminAnalyticsNotConfiguredError
              ? 'not-connected'
              : 'error',
          })
        }
      })
    return () => controller.abort()
  }, [load, reloadToken, retryToken])

  const retry = useCallback(() => setRetryToken(value => value + 1), [])
  return [state, retry] as const
}

const placeholderStyles = 'rounded-lg border border-dashed border-gray-300 px-4 py-8 text-sm leading-relaxed text-gray-500 dark:border-gray-700 dark:text-gray-400'
const galleryStyles = 'grid gap-x-5 gap-y-6 @min-[34rem]/workspace:grid-cols-2 @min-[62rem]/workspace:grid-cols-3'
// Six cards fill the one-, two- and three-column grids evenly.
const rankingLimit = 6

type RankingKey = 'latest' | 'wanted' | 'popular'

const rankingTabs: Array<{ key: RankingKey, label: string }> = [
  { key: 'latest', label: 'Latest' },
  { key: 'wanted', label: 'Most wanted' },
  { key: 'popular', label: 'Popular' },
]

export function AdminOverviewPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [state, dispatch] = useReducer(overviewReducer, undefined, createInitialOverviewState)
  const [reloadToken, setReloadToken] = useState(0)
  const rebuild = useSyncExternalStore(subscribeToWebsiteRebuild, getWebsiteRebuildState, getServerWebsiteRebuildState)
  const isDispatching = rebuild.status === 'pending'
  const hasPending = useSyncExternalStore(subscribeToPendingRebuild, isPendingRebuild, () => false)
  const reload = useCallback(() => setReloadToken(value => value + 1), [])
  const [activeRanking, setActiveRanking] = useState<RankingKey>('latest')
  const tablistRef = useRef<HTMLDivElement>(null)
  const [interest, retryInterest] = useAnalyticsFeed('/api/admin/interest', fetchAdminInterest, reloadToken)
  const [linkClicks, retryLinkClicks] = useAnalyticsFeed('/api/admin/link-clicks', fetchAdminLinkClicks, reloadToken)

  useEffect(() => {
    const controller = new AbortController()
    dispatch({ type: 'loading' })
    void fetchAdminOverviewPayload({ signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted)
          dispatch({ type: 'loaded', payload })
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'failed',
            message: error instanceof Error
              ? error.message
              : 'Could not load overview.',
          })
        }
      })
    return () => controller.abort()
  }, [reloadToken])

  const { payload } = state
  const characters = payload?.bootstrap.characters
  const count = (value: number | undefined) => value === undefined
    ? '—'
    : String(value)
  const metrics = [
    {
      label: 'Commissions',
      value: count(characters?.reduce((total, row) => total + row.commissionCount, 0)),
      detail: 'Indexed works',
    },
    {
      label: 'Characters',
      value: count(characters?.length),
      detail: `${count(characters?.filter(row => row.status === 'active').length)} active · ${count(characters?.filter(row => row.status !== 'active').length)} archived`,
    },
    {
      label: 'Aliases',
      value: payload
        ? String(payload.aliases.characterAliases.length + payload.aliases.creatorAliases.length + payload.aliases.keywordAliases.length)
        : '—',
      // A fixed caption: one that changed length when data arrived would move the Publish card below it.
      detail: 'Character, creator & keyword',
    },
    {
      label: 'Featured keywords',
      value: count(payload?.suggestion.featuredKeywords.length),
      detail: 'Shown as search suggestions',
    },
  ]
  const latest = payload?.bootstrap.commissionSearchRows.toSorted(compareCommissionsByDate).slice(0, rankingLimit) ?? []
  const mostWanted = payload && interest.payload
    ? rankUnpublishedInterest(payload.bootstrap.commissionSearchRows, interest.payload.counts, rankingLimit)
    : []
  const popular = payload && linkClicks.payload
    ? rankPopularCommissions(payload.bootstrap.commissionSearchRows, linkClicks.payload.clicks, interest.payload?.counts ?? {}, rankingLimit)
    : []
  const overviewLoading = !payload && state.isLoading
  const openInEdit = (item: AdminCommissionSearchRow) => {
    requestCommissionEdit({ commissionId: item.id, characterId: item.characterId })
    onNavigate('/edit')
  }
  const renderItems = (items: Array<{ row: AdminCommissionSearchRow, metrics?: ListMetric[] }>) => (
    <ol className={galleryStyles}>
      {items.map(({ row, metrics: itemMetrics }) => (
        <CommissionCard key={row.id} item={row} metrics={itemMetrics} onEdit={openInEdit} />
      ))}
    </ol>
  )

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = rankingTabs.findIndex(tab => tab.key === activeRanking)
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % rankingTabs.length
      : event.key === 'ArrowLeft'
        ? (index + rankingTabs.length - 1) % rankingTabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? rankingTabs.length - 1
            : null
    if (nextIndex === null)
      return
    event.preventDefault()
    const next = rankingTabs[nextIndex].key
    setActiveRanking(next)
    tablistRef.current?.querySelector<HTMLButtonElement>(`#overview-tab-${next}`)?.focus()
  }

  const panels: Record<RankingKey, { busy: boolean, caption: string | null, content: ReactNode }> = {
    latest: {
      busy: overviewLoading,
      caption: 'Newest by delivery date',
      content: latest.length > 0
        ? renderItems(latest.map(row => ({ row })))
        : (
            <p className={placeholderStyles}>
              {payload
                ? 'No commissions yet.'
                : state.isLoading ? 'Loading commissions…' : 'Commissions are unavailable. Retry loading the overview.'}
            </p>
          ),
    },
    wanted: {
      busy: interest.status === 'loading' || overviewLoading,
      caption: interest.payload
        ? `Votes since ${interest.payload.since}`
        : null,
      content: mostWanted.length > 0
        ? renderItems(mostWanted.map(entry => ({
            row: entry.row,
            metrics: [
              { label: 'vote', value: entry.votes },
            ],
          })))
        : <AnalyticsPlaceholder status={interest.status} hasOverview={payload !== null} overviewLoading={overviewLoading} noun="votes" onRetry={retryInterest} />,
    },
    popular: {
      busy: linkClicks.status === 'loading' || overviewLoading,
      caption: linkClicks.payload
        ? `Link clicks since ${linkClicks.payload.since}`
        : null,
      content: popular.length > 0
        ? renderItems(popular.map(entry => ({
            row: entry.row,
            metrics: [
              { label: 'click', value: entry.clicks },
              // Votes stay unknown, not zero, while the vote feed is unavailable.
              {
                label: 'vote',
                value: interest.payload ? entry.votes : null,
              },
            ],
          })))
        : <AnalyticsPlaceholder status={linkClicks.status} hasOverview={payload !== null} overviewLoading={overviewLoading} noun="link clicks" onRetry={retryLinkClicks} />,
    },
  }

  return (
    <div className="grid min-w-0 items-start gap-7 @min-[50rem]/workspace:grid-cols-[minmax(0,1fr)_17rem] @min-[50rem]/workspace:gap-x-8">
      <AdminBootstrapStatus errorMessage={state.errorMessage} isLoading={state.isLoading} hasPayload={payload !== null} onRetry={reload} />
      {(rebuild.status === 'success' || rebuild.status === 'error' || rebuild.status === 'unconfirmed') && (
        <FloatingNotice
          tone={rebuild.status === 'unconfirmed'
            ? 'error'
            : rebuild.status}
          onDismiss={dismissWebsiteRebuildNotice}
        >
          {rebuild.message}
        </FloatingNotice>
      )}

      <section aria-label="Collection summary" aria-busy={overviewLoading} className="min-w-0 @min-[50rem]/workspace:col-start-1">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 @min-[34rem]/workspace:grid-cols-4">
          {metrics.map(metric => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</dt>
              <dd className="mt-1 text-lg/6 font-medium tabular-nums text-gray-900 dark:text-gray-100">{metric.value}</dd>
              <dd className="mt-0.5 text-xs leading-4 text-gray-500 dark:text-gray-400">{metric.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="overview-publish" className="admin-surface min-w-0 space-y-4 rounded-xl border border-gray-200 p-4 sm:p-6 @min-[50rem]/workspace:col-start-2 @min-[50rem]/workspace:row-span-2 @min-[50rem]/workspace:row-start-1 dark:border-gray-800">
        <div className="flex min-w-0 flex-col items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="overview-publish" className="text-base font-semibold text-gray-900 dark:text-gray-100">Publish website</h2>
            <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">Rebuild the public site from saved content.</p>
            {(rebuild.status === 'pending' || rebuild.status === 'success' || rebuild.status === 'error' || rebuild.status === 'unconfirmed') && (
              <p
                role={rebuild.status === 'error' || rebuild.status === 'unconfirmed'
                  ? 'alert'
                  : 'status'}
                className="text-xs text-gray-600 dark:text-gray-400"
              >
                {rebuild.message ?? (rebuild.status === 'pending'
                  ? 'Waiting for the public site to confirm the update.'
                  : null)}
              </p>
            )}
          </div>
          <button type="button" onClick={() => void queueWebsiteRebuild()} disabled={isDispatching} className={`${buttonStyles.secondary} w-full`}>
            {isDispatching ? 'Queueing…' : 'Rebuild website'}
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 text-xs dark:border-gray-800">
          <p className={hasPending ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}>{hasPending ? 'Saved changes are waiting to be published.' : 'You can rebuild at any time.'}</p>
          <details className="group w-full">
            <summary className="cursor-pointer rounded text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-gray-400">Connection details</summary>
            <dl className="mt-3 space-y-2 break-words text-gray-600 dark:text-gray-300">
              <div className="flex flex-wrap gap-x-2">
                <dt>Connection:</dt>
                <dd>
                  {state.errorMessage
                    ? 'Could not refresh data'
                    : payload
                      ? payload.health.status === 'ok'
                        ? 'Connected'
                        : 'Unavailable'
                      : state.isLoading ? 'Checking…' : 'Unavailable'}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt>API origin:</dt>
                <dd className="min-w-0 break-all tabular-nums">{getAdminApiBaseUrl() || 'same-origin'}</dd>
              </div>
              {payload?.health.message && (
                <div>
                  <dt className="sr-only">Health response</dt>
                  <dd>{payload.health.message}</dd>
                </div>
              )}
            </dl>
            <button type="button" onClick={reload} disabled={state.isLoading} className={`${buttonStyles.secondary} mt-3 min-w-28`}>{state.isLoading ? 'Checking…' : 'Refresh data'}</button>
          </details>
        </div>
      </section>

      <section aria-labelledby="overview-commissions" className="min-w-0 space-y-4 @min-[50rem]/workspace:col-start-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 id="overview-commissions" className="text-base font-semibold text-gray-900 dark:text-gray-100">Commissions</h2>
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Commission lists"
            onKeyDown={handleTabKeyDown}
            className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100/80 p-1 dark:bg-gray-950/50"
          >
            {rankingTabs.map(tab => (
              <button
                key={tab.key}
                id={`overview-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={activeRanking === tab.key}
                aria-controls={`overview-panel-${tab.key}`}
                tabIndex={activeRanking === tab.key
                  ? 0
                  : -1}
                onClick={() => setActiveRanking(tab.key)}
                className={`
                  inline-flex min-h-11 min-w-0 items-center justify-center rounded-md px-2 py-2 text-xs font-medium transition
                  focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4 sm:text-sm
                  ${activeRanking === tab.key
                ? 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {/* Panels stay mounted so a feed's state survives switching tabs. */}
        {rankingTabs.map(tab => (
          <div
            key={tab.key}
            id={`overview-panel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`overview-tab-${tab.key}`}
            aria-busy={panels[tab.key].busy}
            hidden={activeRanking !== tab.key}
            className="min-w-0 space-y-3"
          >
            {panels[tab.key].caption && <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{panels[tab.key].caption}</p>}
            {panels[tab.key].content}
          </div>
        ))}
      </section>
    </div>
  )
}

function AnalyticsPlaceholder({ status, hasOverview, overviewLoading, noun, onRetry }: {
  status: AnalyticsStatus
  hasOverview: boolean
  overviewLoading: boolean
  noun: string
  onRetry: () => void
}) {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1)
  if (status === 'error') {
    return (
      <div role="alert" className={`${placeholderStyles} flex flex-wrap items-center justify-between gap-3`}>
        <p>{`Could not load visitor ${noun}.`}</p>
        <button type="button" onClick={onRetry} className={`${buttonStyles.secondary} min-w-28`}>Try again</button>
      </div>
    )
  }
  return (
    <p className={placeholderStyles}>
      {status === 'not-connected'
        ? `Visitor analytics is not connected. ${Noun} appear once the worker has a Rybbit API key.`
        : status === 'loading' || overviewLoading
          ? `Loading ${noun}…`
          : hasOverview
            ? `No ${noun} yet.`
            : `${Noun} are unavailable. Retry loading the overview.`}
    </p>
  )
}

interface ListMetric {
  label: string
  value: number | null
}

// The whole card opens the commission in the edit drawer; the pencil only marks it as editable.
function CommissionCard({ item, metrics = [], onEdit }: {
  item: AdminCommissionSearchRow
  metrics?: ListMetric[]
  onEdit: (item: AdminCommissionSearchRow) => void
}) {
  const title = getCommissionTitle(item)

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onEdit(item)}
        aria-label={`Edit ${getCommissionAccessibleLabel(item)}`}
        className="group block w-full min-w-0 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <img
          src={getAdminApiUrl(`/api/admin/commissions/${item.id}/source-image`)}
          alt=""
          loading="lazy"
          width={1280}
          height={525}
          className="aspect-1280/525 w-full rounded-md bg-gray-100 object-cover dark:bg-gray-800"
        />
        <span className="mt-2.5 flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-100" title={title}>{title}</span>
          <IconPencil className="size-4 shrink-0 text-gray-400 transition group-hover:text-gray-900 dark:text-gray-500 dark:group-hover:text-gray-100" stroke={1.8} aria-hidden="true" />
        </span>
        <span className="mt-1 flex min-w-0 items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="min-w-0 truncate">{item.characterName}</span>
          {/* The short ID stays flush right on every card; metrics sit to its left. */}
          <span className="flex shrink-0 items-center gap-3 tabular-nums">
            {metrics.map(metric => (
              <span key={metric.label}>
                <span className="font-medium text-gray-900 dark:text-gray-100">{metric.value ?? '—'}</span>
                {` ${metric.value === 1
                  ? metric.label
                  : `${metric.label}s`}`}
              </span>
            ))}
            <span title={item.publicId}>{`#${formatCommissionPublicId(item.publicId)}`}</span>
          </span>
        </span>
      </button>
    </li>
  )
}
