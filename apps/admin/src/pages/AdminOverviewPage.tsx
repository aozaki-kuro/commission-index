import type { AdminCommissionSearchRow } from '@commission-index/domain'
import type { AdminOverviewPayload } from '../lib/adminApi'
import { useCallback, useEffect, useReducer, useState, useSyncExternalStore } from 'react'
import { adminActionLinkStyles } from '../app/ui'
import { AdminBootstrapStatus } from '../components/AdminBootstrapStatus'
import { AdminInternalLink } from '../components/AdminInternalLink'
import { FloatingNotice } from '../components/FloatingNotice'
import { AdminAnalyticsNotConfiguredError, fetchAdminInterest, fetchAdminLinkClicks, fetchAdminOverviewPayload, getAdminApiBaseUrl, getAdminApiUrl, readCachedAdminJson } from '../lib/adminApi'
import { compareCommissionsByDate, formatCommissionPublicId, getCommissionTitle } from '../lib/commissionPresentation'
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
const secondaryLinkStyles = 'rounded-md py-1 text-sm text-gray-600 underline underline-offset-4 transition hover:text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-4 dark:text-gray-300 dark:hover:text-white'
const utilityButtonStyles = 'inline-flex h-10 pointer-coarse:h-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition motion-safe:enabled:active:scale-[0.98] hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'

export function AdminOverviewPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [state, dispatch] = useReducer(overviewReducer, undefined, createInitialOverviewState)
  const [reloadToken, setReloadToken] = useState(0)
  const rebuild = useSyncExternalStore(subscribeToWebsiteRebuild, getWebsiteRebuildState, getServerWebsiteRebuildState)
  const isDispatching = rebuild.status === 'pending'
  const hasPending = useSyncExternalStore(subscribeToPendingRebuild, isPendingRebuild, () => false)
  const reload = useCallback(() => setReloadToken(value => value + 1), [])
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
      label: 'Alias rows',
      value: payload
        ? String(payload.aliases.characterAliases.length + payload.aliases.creatorAliases.length + payload.aliases.keywordAliases.length)
        : '—',
      detail: 'Character, creator & keyword',
    },
    {
      label: 'Suggestions',
      value: count(payload?.suggestion.featuredKeywords.length),
      detail: 'Featured keywords',
    },
  ]
  const latest = payload?.bootstrap.commissionSearchRows.toSorted(compareCommissionsByDate).slice(0, 10) ?? []
  const mostWanted = payload && interest.payload
    ? rankUnpublishedInterest(payload.bootstrap.commissionSearchRows, interest.payload.counts)
    : []
  const popular = payload && linkClicks.payload
    ? rankPopularCommissions(payload.bootstrap.commissionSearchRows, linkClicks.payload.clicks, interest.payload?.counts ?? {})
    : []
  const overviewLoading = !payload && state.isLoading

  return (
    <div className="grid min-w-0 items-start gap-7 @min-[50rem]/workspace:grid-cols-[minmax(0,1fr)_17rem] @min-[50rem]/workspace:grid-rows-[auto_1fr] @min-[50rem]/workspace:gap-x-8">
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

      <section aria-labelledby="overview-actions" className="min-w-0 space-y-4 motion-safe:animate-[tabFade_300ms_ease-out] @min-[50rem]/workspace:col-start-1 @min-[50rem]/workspace:row-start-1">
        <h2 id="overview-actions" className="text-base font-semibold text-gray-900 dark:text-gray-100">Manage content</h2>
        <div className="grid min-w-0 gap-3 @min-[35rem]/workspace:grid-cols-2">
          <AdminInternalLink href="/create" onNavigate={onNavigate} className="inline-flex min-h-12 items-center justify-between gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white no-underline transition hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-4 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-white">
            Create commissions
            {' '}
            <span aria-hidden="true">→</span>
          </AdminInternalLink>
          <AdminInternalLink href="/edit" onNavigate={onNavigate} className={`${adminActionLinkStyles} min-h-12`}>
            Edit existing
            {' '}
            <span aria-hidden="true">→</span>
          </AdminInternalLink>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <AdminInternalLink href="/aliases" onNavigate={onNavigate} className={secondaryLinkStyles}>Manage aliases</AdminInternalLink>
          <AdminInternalLink href="/suggestion" onNavigate={onNavigate} className={secondaryLinkStyles}>Curate suggestions</AdminInternalLink>
        </div>
      </section>

      <div className="min-w-0 space-y-7 @min-[50rem]/workspace:col-start-2 @min-[50rem]/workspace:row-span-2 @min-[50rem]/workspace:row-start-1">
        <section aria-labelledby="overview-publish" className="admin-surface min-w-0 space-y-4 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
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
            <button type="button" onClick={() => void queueWebsiteRebuild()} disabled={isDispatching} className={`${utilityButtonStyles} w-full`}>
              {isDispatching ? 'Queueing…' : 'Rebuild website'}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 text-xs dark:border-gray-700">
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
                {payload && (
                  <div>
                    <dt className="sr-only">Alias breakdown</dt>
                    <dd>{`${payload.aliases.characterAliases.length} character / ${payload.aliases.creatorAliases.length} creator / ${payload.aliases.keywordAliases.length} keyword alias rows`}</dd>
                  </div>
                )}
              </dl>
              <button type="button" onClick={reload} disabled={state.isLoading} className={`${utilityButtonStyles} mt-3 w-28`}>{state.isLoading ? 'Checking…' : 'Refresh data'}</button>
            </details>
          </div>
        </section>

        <section aria-label="Collection summary" aria-busy={!payload && state.isLoading} className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Collection</h2>
          <dl className="mt-3 divide-y divide-gray-200 dark:divide-gray-800">
            {metrics.map(metric => (
              <div key={metric.label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-3">
                <dt className="text-sm text-gray-600 dark:text-gray-300">{metric.label}</dt>
                <dd className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">{metric.value}</dd>
                <dd className="col-span-2 mt-1 text-xs leading-4 text-gray-500 dark:text-gray-400">{metric.detail}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="min-w-0 space-y-7 @min-[50rem]/workspace:col-start-1 @min-[50rem]/workspace:row-start-2">
        <section aria-labelledby="overview-latest" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="overview-latest" className="text-base font-semibold text-gray-900 dark:text-gray-100">Latest commissions</h2>
            <AdminInternalLink href="/edit" onNavigate={onNavigate} className={secondaryLinkStyles}>Open edit view</AdminInternalLink>
          </div>
          {latest.length > 0
            ? (
                <ol className="divide-y divide-gray-200 dark:divide-gray-800">
                  {latest.map(item => <CommissionListItem key={item.id} item={item} />)}
                </ol>
              )
            : (
                <p className={placeholderStyles}>
                  {payload
                    ? 'No commissions yet. Create your first commission above.'
                    : state.isLoading ? 'Loading commissions…' : 'Commissions are unavailable. Retry loading the overview.'}
                </p>
              )}
        </section>

        <section aria-labelledby="overview-most-wanted" aria-busy={interest.status === 'loading' || overviewLoading} className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="overview-most-wanted" className="text-base font-semibold text-gray-900 dark:text-gray-100">Most wanted</h2>
            {interest.payload && <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{`Votes since ${interest.payload.since}`}</p>}
          </div>
          {mostWanted.length > 0
            ? (
                <ol className="divide-y divide-gray-200 dark:divide-gray-800">
                  {mostWanted.map(entry => (
                    <CommissionListItem
                      key={entry.row.id}
                      item={entry.row}
                      metrics={[
                        { label: 'vote', value: entry.votes },
                      ]}
                    />
                  ))}
                </ol>
              )
            : <AnalyticsPlaceholder status={interest.status} hasOverview={payload !== null} overviewLoading={overviewLoading} noun="votes" onRetry={retryInterest} />}
        </section>

        <section aria-labelledby="overview-popular" aria-busy={linkClicks.status === 'loading' || overviewLoading} className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="overview-popular" className="text-base font-semibold text-gray-900 dark:text-gray-100">Popular this year</h2>
            {linkClicks.payload && <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{`Link clicks since ${linkClicks.payload.since}`}</p>}
          </div>
          {popular.length > 0
            ? (
                <ol className="divide-y divide-gray-200 dark:divide-gray-800">
                  {popular.map(entry => (
                    <CommissionListItem
                      key={entry.row.id}
                      item={entry.row}
                      metrics={[
                        { label: 'click', value: entry.clicks },
                        // Votes stay unknown, not zero, while the vote feed is unavailable.
                        {
                          label: 'vote',
                          value: interest.payload ? entry.votes : null,
                        },
                      ]}
                    />
                  ))}
                </ol>
              )
            : <AnalyticsPlaceholder status={linkClicks.status} hasOverview={payload !== null} overviewLoading={overviewLoading} noun="link clicks" onRetry={retryLinkClicks} />}
        </section>
      </div>
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
        <button type="button" onClick={onRetry} className={`${utilityButtonStyles} min-w-28`}>Try again</button>
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

function CommissionListItem({ item, metrics = [] }: { item: AdminCommissionSearchRow, metrics?: ListMetric[] }) {
  return (
    <li className="flex min-w-0 items-center gap-3 py-2.5 sm:gap-4">
      <img
        src={getAdminApiUrl(`/api/admin/commissions/${item.id}/source-image`)}
        alt=""
        loading="lazy"
        width={128}
        height={64}
        className="h-14 w-20 shrink-0 rounded-md bg-gray-100 object-cover sm:w-24 dark:bg-gray-800"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100" title={getCommissionTitle(item)}>{getCommissionTitle(item)}</p>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="min-w-0 truncate">{item.characterName}</span>
          {/* The short ID stays flush right in every list; metrics sit to its left. */}
          <span className="ml-auto flex shrink-0 items-center gap-3 tabular-nums">
            {metrics.map(metric => (
              <span key={metric.label}>
                <span className="font-medium text-gray-900 dark:text-gray-100">{metric.value ?? '—'}</span>
                {` ${metric.value === 1
                  ? metric.label
                  : `${metric.label}s`}`}
              </span>
            ))}
            <span title={item.publicId}>
              #
              {formatCommissionPublicId(item.publicId)}
            </span>
          </span>
        </div>
      </div>
    </li>
  )
}
