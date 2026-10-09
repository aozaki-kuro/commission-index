import type { BuildInfo } from '@commission-index/domain'
import { getPublicSiteUrl } from './publicSiteUrl'

type Listener = () => void
const listeners = new Set<Listener>()
let liveBuildInfo: BuildInfo | null = null

function notify() {
  for (const listener of listeners)
    listener()
}

export function getLiveBuildInfo(): BuildInfo | null {
  return liveBuildInfo
}

export function getServerLiveBuildInfo(): BuildInfo | null {
  return null
}

export function subscribeToLiveBuildInfo(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseBuildInfo(value: unknown): BuildInfo {
  if (!isRecord(value)
    || typeof value.dataRevision !== 'string'
    || typeof value.dataExportedAt !== 'string'
    || typeof value.builtAt !== 'string'
    || (value.codeSha !== null && typeof value.codeSha !== 'string')) {
    throw new TypeError('build-info.json has an invalid shape.')
  }
  return {
    dataRevision: value.dataRevision,
    dataExportedAt: value.dataExportedAt,
    codeSha: value.codeSha,
    builtAt: value.builtAt,
  }
}

// `dataExportedAt` is stamped by the GitHub runner clock, `dispatchedAt` by the worker clock.
// Both hosts are NTP-synced (sub-second), but a runner a few seconds behind would otherwise
// never confirm a snapshot it exported after the dispatch. A 30 s tolerance absorbs that skew;
// it only admits snapshots exported within 30 s before the dispatch (by then near-current), while
// a genuinely stale snapshot is minutes behind and still fails the check.
export const rebuildClockSkewToleranceMs = 30000

// A rebuild has picked up the saves made before its dispatch when the snapshot it
// exported was read at or after that dispatch. builtAt is not used: a build that
// started before the dispatch but finished after it would pass a builtAt check.
export function isBuildConfirmed(info: BuildInfo, dispatchedAt: string): boolean {
  const exportedAt = Date.parse(info.dataExportedAt)
  const dispatched = Date.parse(dispatchedAt)
  return Number.isFinite(exportedAt) && Number.isFinite(dispatched)
    && exportedAt >= dispatched - rebuildClockSkewToleranceMs
}

export async function fetchLiveBuildInfo(signal?: AbortSignal): Promise<BuildInfo> {
  // Cross-origin read; the public _headers grants CORS to this file only.
  const response = await fetch(new URL('/build-info.json', getPublicSiteUrl()), {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    throw new Error(`build-info.json returned HTTP ${response.status}`)
  }
  const info = parseBuildInfo(await response.json())
  liveBuildInfo = info
  notify()
  return info
}
