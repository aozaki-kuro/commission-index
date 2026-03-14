import type { AnalyticsEventProperties } from '#lib/analytics/track'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'

type TrackEvent = (name: string, properties?: AnalyticsEventProperties) => void

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

const IDLE_SAMPLE_TIMEOUT_MS = 500
const IDLE_SAMPLE_FALLBACK_DELAY_MS = 120
const IDLE_SAMPLE_MAX_MATCHES = 24
const IDLE_SAMPLE_MAX_SCANS = 96
const IDLE_SAMPLE_VIEWPORT_MULTIPLIER = 2
const TRACKED_WIDTH_VARIANTS = new Set([768, 960, 1280])
const IMAGE_NODE_SELECTOR = '[data-commission-image-node="true"]'
const SRC_SET_ENTRY_SEPARATOR_PATTERN = /\s+/

interface SrcSetCandidate {
  url: string
  width: number | null
}

function normalizeImageUrl(url: string, win: Window) {
  if (!url)
    return ''

  try {
    const parsed = new URL(url, win.location.href)
    parsed.hash = ''
    return parsed.href
  }
  catch {
    return url.trim()
  }
}

function parseSrcSetCandidates(srcSet: string, win: Window): SrcSetCandidate[] {
  if (!srcSet)
    return []

  return srcSet
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawUrl, descriptor] = entry.split(SRC_SET_ENTRY_SEPARATOR_PATTERN, 2)
      const widthValue = descriptor?.endsWith('w')
        ? Number.parseInt(descriptor.slice(0, -1), 10)
        : Number.NaN

      return {
        url: normalizeImageUrl(rawUrl ?? '', win),
        width: Number.isFinite(widthValue) ? widthValue : null,
      }
    })
}

function detectVariantFromQueryParam(sourceUrl: string, win: Window): '768' | '960' | '1280' | null {
  try {
    const parsed = new URL(sourceUrl, win.location.href)
    const width = Number.parseInt(parsed.searchParams.get('w') ?? '', 10)
    if (width === 768)
      return '768'
    if (width === 960)
      return '960'
    if (width === 1280)
      return '1280'
  }
  catch {
    return null
  }

  return null
}

function detectLoadedVariant(currentSrc: string, srcSet: string, win: Window): '768' | '960' | '1280' | 'base' | 'unknown' {
  if (!currentSrc)
    return 'unknown'

  const normalizedCurrentSrc = normalizeImageUrl(currentSrc, win)
  const srcSetCandidates = parseSrcSetCandidates(srcSet, win)
  const matchedCandidate = srcSetCandidates.find((candidate) => {
    if (!candidate.width || !TRACKED_WIDTH_VARIANTS.has(candidate.width))
      return false
    return candidate.url === normalizedCurrentSrc
  })

  if (matchedCandidate?.width === 768)
    return '768'
  if (matchedCandidate?.width === 960)
    return '960'
  if (matchedCandidate?.width === 1280)
    return '1280'

  const queryVariant = detectVariantFromQueryParam(normalizedCurrentSrc, win)
  if (queryVariant)
    return queryVariant

  const normalized = normalizedCurrentSrc.toLowerCase()
  if (normalized.includes('-768.webp'))
    return '768'
  if (normalized.includes('-960.webp'))
    return '960'
  if (normalized.includes('-1280.webp'))
    return '1280'
  if (normalized.includes('.webp'))
    return 'base'
  return 'unknown'
}

export function createCommissionImageVariantTracker(trackEvent: TrackEvent, win: Window, doc: Document) {
  const trackedVariantKeys = new Set<string>()

  const trackImageLoadedVariant = (image: HTMLImageElement) => {
    const variant = detectLoadedVariant(image.currentSrc || image.src, image.srcset, win)
    const trackKey = `${variant}:${Math.round(win.devicePixelRatio || 1)}`
    if (trackedVariantKeys.has(trackKey))
      return

    trackedVariantKeys.add(trackKey)
    trackEvent(ANALYTICS_EVENTS.commissionImageVariantLoaded, {
      variant,
      dpr: Number((win.devicePixelRatio || 1).toFixed(2)),
      viewport_width: win.innerWidth,
    })
  }

  const handleImageLoadCaptureEvent = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLImageElement))
      return
    if (!target.matches(IMAGE_NODE_SELECTOR))
      return

    trackImageLoadedVariant(target)
  }

  const sampleLoadedImagesNearViewport = () => {
    const images = doc.querySelectorAll<HTMLImageElement>(IMAGE_NODE_SELECTOR)
    const viewportTop = -win.innerHeight
    const viewportBottom = win.innerHeight * IDLE_SAMPLE_VIEWPORT_MULTIPLIER

    let scanCount = 0
    let matchedCount = 0

    for (const image of images) {
      if (scanCount >= IDLE_SAMPLE_MAX_SCANS || matchedCount >= IDLE_SAMPLE_MAX_MATCHES)
        break
      scanCount += 1

      if (!image.complete || image.naturalWidth <= 0)
        continue

      const rect = image.getBoundingClientRect()
      if (rect.top > viewportBottom)
        break
      if (rect.bottom < viewportTop)
        continue

      trackImageLoadedVariant(image)
      matchedCount += 1
    }
  }

  const scheduleIdleSampling = (task: () => void) => {
    const idleWindow = win as IdleWindow

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleHandle = idleWindow.requestIdleCallback(
        () => {
          task()
        },
        { timeout: IDLE_SAMPLE_TIMEOUT_MS },
      )

      return () => {
        if (typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleHandle)
        }
      }
    }

    const timeoutHandle = win.setTimeout(task, IDLE_SAMPLE_FALLBACK_DELAY_MS)
    return () => {
      win.clearTimeout(timeoutHandle)
    }
  }

  return {
    handleImageLoadCaptureEvent,
    sampleLoadedImagesNearViewport,
    scheduleIdleSampling,
  }
}
