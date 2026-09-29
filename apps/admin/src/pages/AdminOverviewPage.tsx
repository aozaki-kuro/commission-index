import type { AdminCommissionSearchRow } from '@commission-index/domain'
import type { ReactNode } from 'react'
import type { StatusTone } from '../app/ui'
import type { AdminOverviewPayload } from '../lib/adminApi'
import { useCallback, useEffect, useEffectEvent, useReducer, useState } from 'react'
import {
  adminActionLinkStyles,
  adminInsetCardStyles,
  adminMetricCardStyles,
  adminSurfaceStyles,
  getStatusBadgeStyles,
} from '../app/ui'
import { AdminInternalLink } from '../components/AdminInternalLink'
import {
  fetchAdminOverviewPayload,
  getAdminApiBaseUrl,
  readCachedAdminJson,
  triggerRebuildDeploy,
} from '../lib/adminApi'
import { compareCommissionsByDate, getCommissionDisplayLabel } from '../lib/commissionPresentation'

const LATEST_ENTRY_LIMIT = 10
const overviewCacheKey = '/api/admin/overview'

interface OverviewMetrics {
  activeCharacters: number
  characterAliasCount: number
  creatorAliasCount: number
  featuredKeywordCount: number
  keywordAliasCount: number
  archivedCharacters: number
  totalAliasRows: number
  totalCharacters: number
  totalCommissions: number
}

interface OverviewState {
  errorMessage: string | null
  isLoading: boolean
  payload: AdminOverviewPayload | null
}

type OverviewAction
  = { type: 'loading' }
    | { payload: AdminOverviewPayload, type: 'loaded' }
    | { message: string, type: 'failed' }

function createInitialOverviewState(): OverviewState {
  const payload = readCachedAdminJson<AdminOverviewPayload>(overviewCacheKey)

  return {
    errorMessage: null,
    isLoading: payload === null,
    payload,
  }
}

function overviewReducer(state: OverviewState, action: OverviewAction): OverviewState {
  switch (action.type) {
    case 'loading':
      return {
        ...state,
        errorMessage: null,
        isLoading: true,
      }
    case 'loaded':
      return {
        errorMessage: null,
        isLoading: false,
        payload: action.payload,
      }
    case 'failed':
      return {
        ...state,
        errorMessage: action.message,
        isLoading: false,
      }
  }
}

function buildOverviewMetrics(payload: AdminOverviewPayload): OverviewMetrics {
  const totalCharacters = payload.bootstrap.characters.length
  const activeCharacters = payload.bootstrap.characters.filter(row => row.status === 'active').length
  const characterAliasCount = payload.aliases.characterAliases.length
  const creatorAliasCount = payload.aliases.creatorAliases.length
  const keywordAliasCount = payload.aliases.keywordAliases.length

  return {
    activeCharacters,
    characterAliasCount,
    creatorAliasCount,
    featuredKeywordCount: payload.suggestion.featuredKeywords.length,
    keywordAliasCount,
    archivedCharacters: totalCharacters - activeCharacters,
    totalAliasRows: characterAliasCount + creatorAliasCount + keywordAliasCount,
    totalCharacters,
    totalCommissions: payload.bootstrap.characters.reduce(
      (count, row) => count + row.commissionCount,
      0,
    ),
  }
}

function getLatestCommissions(rows: AdminCommissionSearchRow[]) {
  return rows
    .toSorted(compareCommissionsByDate)
    .slice(0, LATEST_ENTRY_LIMIT)
}

function getMetricValue(value: number | null) {
  return value === null ? '...' : String(value)
}

function getStatusTone(payload: AdminOverviewPayload | null, errorMessage: string | null): StatusTone {
  if (errorMessage) {
    return 'blocked'
  }

  if (payload?.health.status === 'ok') {
    return 'done'
  }

  return 'pending'
}

function getStatusLabel(payload: AdminOverviewPayload | null, errorMessage: string | null, isLoading: boolean) {
  if (errorMessage) {
    return 'Worker error'
  }

  if (payload?.health.status === 'ok') {
    return 'Healthy'
  }

  return isLoading ? 'Loading' : 'Pending'
}

function getStatusDescription(
  payload: AdminOverviewPayload | null,
  errorMessage: string | null,
  isLoading: boolean,
) {
  if (errorMessage) {
    return errorMessage
  }

  if (payload) {
    return payload.health.message ?? 'Standalone admin worker is responding.'
  }

  return isLoading ? 'Loading live worker status...' : 'Worker status unavailable.'
}

function MetricCard({ title, value, children, index = 0 }: { title: string, value: string, children: ReactNode, index?: number }) {
  return (
    <article
      className={`
        ${adminMetricCardStyles}
        motion-safe:animate-[tabFade_400ms_cubic-bezier(0.25,1,0.5,1)_backwards]
      `}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <p className="
        text-xs font-semibold tracking-wide text-gray-500 uppercase
        dark:text-gray-300
      "
      >
        {title}
      </p>
      <p className="
        mt-2 text-3xl font-semibold text-gray-900
        dark:text-gray-100
      "
      >
        {value}
      </p>
      <p className="
        mt-2 text-xs text-gray-600
        dark:text-gray-300
      "
      >
        {children}
      </p>
    </article>
  )
}

interface AdminOverviewPageProps {
  onNavigate: (path: string) => void
}

export function AdminOverviewPage({ onNavigate }: AdminOverviewPageProps) {
  const [state, dispatch] = useReducer(overviewReducer, undefined, createInitialOverviewState)
  const [reloadToken, setReloadToken] = useState(0)
  const apiBaseUrl = getAdminApiBaseUrl() || 'same-origin'
  const [forceRebuildLabel, setForceRebuildLabel] = useState('Force rebuild')
  const hasPayload = useEffectEvent(() => state.payload !== null)

  const handleForceRebuild = useCallback(async () => {
    setForceRebuildLabel('Dispatching…')
    try {
      await triggerRebuildDeploy()
      setForceRebuildLabel('Dispatched ✓')
    }
    catch {
      setForceRebuildLabel('Failed — retry')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let isDisposed = false

    if (!hasPayload()) {
      dispatch({ type: 'loading' })
    }

    void fetchAdminOverviewPayload({
      signal: controller.signal,
    })
      .then((payload) => {
        if (isDisposed) {
          return
        }

        dispatch({
          payload,
          type: 'loaded',
        })
      })
      .catch((error) => {
        if (isDisposed) {
          return
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        dispatch({
          message: error instanceof Error ? error.message : 'Failed to load admin overview.',
          type: 'failed',
        })
      })

    return () => {
      isDisposed = true
      controller.abort()
    }
  }, [reloadToken])

  const metrics = state.payload ? buildOverviewMetrics(state.payload) : null
  const latestCommissions = state.payload ? getLatestCommissions(state.payload.bootstrap.commissionSearchRows) : []
  const statusTone = getStatusTone(state.payload, state.errorMessage)
  const statusLabel = getStatusLabel(state.payload, state.errorMessage, state.isLoading)
  const statusDescription = getStatusDescription(state.payload, state.errorMessage, state.isLoading)

  return (
    <>
      <section className="
        grid gap-4
        sm:grid-cols-2
      "
      >
        <MetricCard index={0} title="Characters" value={getMetricValue(metrics?.totalCharacters ?? null)}>
          Active
          {' '}
          {getMetricValue(metrics?.activeCharacters ?? null)}
          {' '}
          / Archived
          {' '}
          {getMetricValue(metrics?.archivedCharacters ?? null)}
        </MetricCard>

        <MetricCard index={1} title="Commissions" value={getMetricValue(metrics?.totalCommissions ?? null)}>
          Indexed entries available for admin search.
        </MetricCard>

        <MetricCard index={2} title="Alias Rows" value={getMetricValue(metrics?.totalAliasRows ?? null)}>
          Character
          {' '}
          {getMetricValue(metrics?.characterAliasCount ?? null)}
          {' '}
          / Creator
          {' '}
          {getMetricValue(metrics?.creatorAliasCount ?? null)}
          {' '}
          / Keyword
          {' '}
          {getMetricValue(metrics?.keywordAliasCount ?? null)}
        </MetricCard>

        <MetricCard index={3} title="Featured Keywords" value={getMetricValue(metrics?.featuredKeywordCount ?? null)}>
          Curated home suggestions.
        </MetricCard>
      </section>

      <section className={adminSurfaceStyles}>
        <h2 className="
          text-sm font-semibold text-gray-900
          dark:text-gray-100
        "
        >
          Quick actions
        </h2>
        <p className="
          mt-1 text-xs text-gray-600
          dark:text-gray-300
        "
        >
          Split workflows for faster maintenance.
        </p>
        <div className="
          mt-4 grid gap-3
          sm:grid-cols-2
        "
        >
          <AdminInternalLink href="/create" onNavigate={onNavigate} className={adminActionLinkStyles}>
            Create entries
            <span aria-hidden="true">→</span>
          </AdminInternalLink>
          <AdminInternalLink href="/edit" onNavigate={onNavigate} className={adminActionLinkStyles}>
            Edit existing
            <span aria-hidden="true">→</span>
          </AdminInternalLink>
          <AdminInternalLink href="/aliases" onNavigate={onNavigate} className={adminActionLinkStyles}>
            Manage aliases
            <span aria-hidden="true">→</span>
          </AdminInternalLink>
          <AdminInternalLink href="/suggestion" onNavigate={onNavigate} className={adminActionLinkStyles}>
            Curate suggestions
            <span aria-hidden="true">→</span>
          </AdminInternalLink>
        </div>

        <div className="
          mt-4 border-t border-gray-200/80 pt-4
          dark:border-gray-700/80
        "
        >
          <div className="flex items-center justify-between gap-3">
            <p className="
              text-xs text-gray-500
              dark:text-gray-400
            "
            >
              Trigger a full data export + web deploy via GitHub Actions.
            </p>
            <button
              type="button"
              onClick={handleForceRebuild}
              disabled={forceRebuildLabel === 'Dispatching…'}
              className="
                shrink-0 rounded-lg border border-gray-300/80 px-3 py-1.5
                text-xs font-medium text-gray-700 transition
                hover:border-gray-400 hover:text-gray-900
                active:scale-[0.97]
                disabled:cursor-not-allowed disabled:opacity-50
                dark:border-gray-700 dark:text-gray-200
                dark:hover:border-gray-600 dark:hover:text-gray-100
              "
            >
              {forceRebuildLabel}
            </button>
          </div>
        </div>

      </section>

      <section className={adminSurfaceStyles}>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="
              text-sm font-semibold text-gray-900
              dark:text-gray-100
            "
            >
              System status
            </h2>
            <p className="
              text-xs text-gray-600
              dark:text-gray-300
            "
            >
              The standalone admin now reads and writes through the remote admin worker.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`
              inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium
              ${getStatusBadgeStyles(statusTone)}
            `}
            >
              {statusLabel}
            </span>
            <button
              type="button"
              className="
                rounded-lg border border-gray-300/80 px-3 py-1.5 text-xs
                font-medium text-gray-700 transition
                hover:border-gray-400 hover:text-gray-900
                active:scale-[0.97]
                dark:border-gray-700 dark:text-gray-200
                dark:hover:border-gray-600 dark:hover:text-gray-100
              "
              onClick={() => setReloadToken(token => token + 1)}
              disabled={state.isLoading}
            >
              {state.isLoading ? 'Loading…' : 'Reload'}
            </button>
          </div>
        </div>

        <div className="
          mt-4 grid gap-3
          md:grid-cols-2
        "
        >
          <article className={adminInsetCardStyles}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="
                text-sm font-medium text-gray-900
                dark:text-gray-100
              "
              >
                Admin worker
              </h3>
              <span className={`
                inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium
                ${getStatusBadgeStyles(statusTone)}
              `}
              >
                {statusLabel}
              </span>
            </div>
            <p className="
              mt-3 text-xs text-gray-600
              dark:text-gray-300
            "
            >
              {statusDescription}
            </p>
          </article>

          <article className={adminInsetCardStyles}>
            <h3 className="
              text-sm font-medium text-gray-900
              dark:text-gray-100
            "
            >
              API origin
            </h3>
            <p className="
              mt-3 font-mono text-xs break-all text-gray-600
              dark:text-gray-300
            "
            >
              {apiBaseUrl}
            </p>
            <p className="
              mt-3 text-xs text-gray-600
              dark:text-gray-300
            "
            >
              All admin reads and writes now go through the worker-backed D1/R2 API.
            </p>
          </article>
        </div>
      </section>

      <section className={adminSurfaceStyles}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="
            text-sm font-semibold text-gray-900
            dark:text-gray-100
          "
          >
            Latest entries
          </h2>
          <AdminInternalLink
            href="/edit"
            onNavigate={onNavigate}
            className="
              text-xs text-gray-600
              hover:text-gray-900
              dark:text-gray-300
              dark:hover:text-gray-100
            "
          >
            Open edit view
          </AdminInternalLink>
        </div>

        {latestCommissions.length === 0
          ? (
              <p className="
                mt-4 text-sm text-gray-600
                dark:text-gray-300
              "
              >
                {state.errorMessage ? 'Latest entries are unavailable until overview data loads.' : 'No commissions found.'}
              </p>
            )
          : (
              <ol className="mt-4 space-y-2">
                {latestCommissions.map(item => (
                  <li
                    key={item.id}
                    className="
                      flex items-center justify-between gap-3 rounded-lg border
                      border-gray-200/80 bg-white/80 px-3 py-2 text-xs
                      dark:border-gray-700 dark:bg-gray-950/40
                    "
                  >
                    <span className="
                      min-w-0 truncate font-mono text-gray-800
                      dark:text-gray-100
                    "
                    >
                      {getCommissionDisplayLabel(item)}
                    </span>
                    <span className="
                      shrink-0 text-gray-500
                      dark:text-gray-300
                    "
                    >
                      {item.characterName}
                    </span>
                  </li>
                ))}
              </ol>
            )}
      </section>
    </>
  )
}
