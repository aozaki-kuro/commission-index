import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { useEffect, useState, type ComponentType } from 'react'

type InitialNotice = {
  left: number
  top: number
  text: string
} | null

const NOTICE_OFFSET = 14
const NOTICE_MIN_OFFSET = 12
const NOTICE_WIDTH = 356
const NOTICE_HEIGHT = 120
const IMAGE_CONTAINER_SELECTOR = '[data-commission-image="true"]'
const IMAGE_NODE_SELECTOR = '[data-commission-image-node="true"]'
const IDLE_SAMPLE_TIMEOUT_MS = 500
const IDLE_SAMPLE_FALLBACK_DELAY_MS = 120
const IDLE_SAMPLE_MAX_MATCHES = 24
const IDLE_SAMPLE_MAX_SCANS = 96
const IDLE_SAMPLE_VIEWPORT_MULTIPLIER = 2
const TRACKED_WIDTH_VARIANTS = new Set([768, 960, 1280])
const trackedVariantKeys = new Set<string>()

type CommissionImageNoticeClientProps = {
  initialNotice?: InitialNotice
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

let cachedNoticeClient: ComponentType<CommissionImageNoticeClientProps> | null = null
let noticeClientPromise: Promise<ComponentType<CommissionImageNoticeClientProps>> | null = null

const loadCommissionImageNoticeClient = async (): Promise<
  ComponentType<CommissionImageNoticeClientProps>
> => {
  if (cachedNoticeClient) return cachedNoticeClient
  if (!noticeClientPromise) {
    noticeClientPromise = import('#features/home/commission/CommissionImageNoticeClient').then(
      mod => {
        cachedNoticeClient = mod.default
        return mod.default
      },
    )
  }

  return noticeClientPromise
}

const normalizeImageUrl = (url: string) => {
  if (!url) return ''

  try {
    const parsed = new URL(url, window.location.href)
    parsed.hash = ''
    return parsed.href
  } catch {
    return url.trim()
  }
}

type SrcSetCandidate = {
  url: string
  width: number | null
}

const parseSrcSetCandidates = (srcSet: string): SrcSetCandidate[] => {
  if (!srcSet) return []

  return srcSet
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [rawUrl, descriptor] = entry.split(/\s+/, 2)
      const widthValue = descriptor?.endsWith('w')
        ? Number.parseInt(descriptor.slice(0, -1), 10)
        : Number.NaN

      return {
        url: normalizeImageUrl(rawUrl ?? ''),
        width: Number.isFinite(widthValue) ? widthValue : null,
      }
    })
}

const detectVariantFromQueryParam = (sourceUrl: string): '768' | '960' | '1280' | null => {
  try {
    const parsed = new URL(sourceUrl, window.location.href)
    const width = Number.parseInt(parsed.searchParams.get('w') ?? '', 10)
    if (width === 768) return '768'
    if (width === 960) return '960'
    if (width === 1280) return '1280'
  } catch {
    return null
  }

  return null
}

const detectLoadedVariant = (
  currentSrc: string,
  srcSet: string,
): '768' | '960' | '1280' | 'base' | 'unknown' => {
  if (!currentSrc) return 'unknown'

  const normalizedCurrentSrc = normalizeImageUrl(currentSrc)
  const srcSetCandidates = parseSrcSetCandidates(srcSet)
  const matchedCandidate = srcSetCandidates.find(candidate => {
    if (!candidate.width || !TRACKED_WIDTH_VARIANTS.has(candidate.width)) return false
    return candidate.url === normalizedCurrentSrc
  })

  if (matchedCandidate?.width === 768) return '768'
  if (matchedCandidate?.width === 960) return '960'
  if (matchedCandidate?.width === 1280) return '1280'

  const queryVariant = detectVariantFromQueryParam(normalizedCurrentSrc)
  if (queryVariant) return queryVariant

  const normalized = normalizedCurrentSrc.toLowerCase()
  if (normalized.includes('-768.webp')) return '768'
  if (normalized.includes('-960.webp')) return '960'
  if (normalized.includes('-1280.webp')) return '1280'
  if (normalized.includes('.webp')) return 'base'
  return 'unknown'
}

const trackImageLoadedVariant = (image: HTMLImageElement) => {
  const variant = detectLoadedVariant(image.currentSrc || image.src, image.srcset)
  const trackKey = `${variant}:${Math.round(window.devicePixelRatio || 1)}`
  if (trackedVariantKeys.has(trackKey)) return

  trackedVariantKeys.add(trackKey)
  trackRybbitEvent(ANALYTICS_EVENTS.commissionImageVariantLoaded, {
    variant,
    dpr: Number((window.devicePixelRatio || 1).toFixed(2)),
    viewport_width: window.innerWidth,
  })
}

const scheduleIdleSampling = (task: () => void) => {
  const idleWindow = window as IdleWindow

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

  const timeoutHandle = window.setTimeout(task, IDLE_SAMPLE_FALLBACK_DELAY_MS)
  return () => {
    window.clearTimeout(timeoutHandle)
  }
}

const sampleLoadedImagesNearViewport = () => {
  const images = document.querySelectorAll<HTMLImageElement>(IMAGE_NODE_SELECTOR)
  const viewportTop = -window.innerHeight
  const viewportBottom = window.innerHeight * IDLE_SAMPLE_VIEWPORT_MULTIPLIER

  let scanCount = 0
  let matchedCount = 0

  for (const image of images) {
    if (scanCount >= IDLE_SAMPLE_MAX_SCANS || matchedCount >= IDLE_SAMPLE_MAX_MATCHES) break
    scanCount += 1

    if (!image.complete || image.naturalWidth <= 0) continue

    const rect = image.getBoundingClientRect()
    if (rect.top > viewportBottom) break
    if (rect.bottom < viewportTop) continue

    trackImageLoadedVariant(image)
    matchedCount += 1
  }
}

export default function CommissionImageNoticeGate() {
  const [enabled, setEnabled] = useState(false)
  const [initialNotice, setInitialNotice] = useState<InitialNotice>(null)
  const [NoticeClient, setNoticeClient] =
    useState<ComponentType<CommissionImageNoticeClientProps> | null>(() => cachedNoticeClient)

  useEffect(() => {
    const onImageLoadCapture = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement)) return
      if (!target.matches(IMAGE_NODE_SELECTOR)) return

      trackImageLoadedVariant(target)
    }

    document.addEventListener('load', onImageLoadCapture, true)
    const cleanupIdleSampling = scheduleIdleSampling(sampleLoadedImagesNearViewport)

    return () => {
      document.removeEventListener('load', onImageLoadCapture, true)
      cleanupIdleSampling()
    }
  }, [])

  useEffect(() => {
    if (enabled) return

    const onFirstContextMenu = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const trigger = target.closest<HTMLElement>(IMAGE_CONTAINER_SELECTOR)
      if (!trigger) return

      const altText = trigger.dataset.commissionAlt?.trim()
      if (!altText) return

      event.preventDefault()
      setInitialNotice({
        left: Math.min(
          event.clientX + NOTICE_OFFSET,
          Math.max(NOTICE_MIN_OFFSET, window.innerWidth - NOTICE_WIDTH),
        ),
        top: Math.min(
          event.clientY + NOTICE_OFFSET,
          Math.max(NOTICE_MIN_OFFSET, window.innerHeight - NOTICE_HEIGHT),
        ),
        text: altText,
      })
      void loadCommissionImageNoticeClient().then(component => {
        setNoticeClient(() => component)
      })
      setEnabled(true)
    }

    document.addEventListener('contextmenu', onFirstContextMenu)
    return () => {
      document.removeEventListener('contextmenu', onFirstContextMenu)
    }
  }, [enabled])

  if (!enabled || !NoticeClient) return null

  return <NoticeClient initialNotice={initialNotice} />
}
