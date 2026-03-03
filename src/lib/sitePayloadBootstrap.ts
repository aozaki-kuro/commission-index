import type { SitePayload } from '#lib/sitePayload'

const SITE_PAYLOAD_SCRIPT_ID = 'site-payload'
let didAttemptScriptRead = false

const isSitePayloadLike = (value: unknown): value is SitePayload => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SitePayload>
  return (
    Array.isArray(candidate.commissionData) &&
    !!candidate.characterStatus &&
    Array.isArray(candidate.creatorAliases) &&
    Array.isArray(candidate.timelineGroups) &&
    Array.isArray(candidate.monthNavItems) &&
    Array.isArray(candidate.activeCharacterNames)
  )
}

export const getBootstrappedSitePayload = (): SitePayload | null => {
  if (typeof window === 'undefined') return null

  if (isSitePayloadLike(window.__SITE_PAYLOAD__)) {
    return window.__SITE_PAYLOAD__
  }

  if (didAttemptScriptRead) return null
  didAttemptScriptRead = true

  const payloadElement = document.getElementById(SITE_PAYLOAD_SCRIPT_ID)
  const payloadText = payloadElement?.textContent?.trim()
  if (!payloadText) return null

  try {
    const parsed = JSON.parse(payloadText) as unknown
    if (!isSitePayloadLike(parsed)) return null
    window.__SITE_PAYLOAD__ = parsed
    return parsed
  } catch {
    return null
  }
}
