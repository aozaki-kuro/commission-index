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
const trackedVariantKeys = new Set<string>()

type CommissionImageNoticeClientProps = {
  initialNotice?: InitialNotice
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

const detectLoadedVariant = (currentSrc: string): '960' | '1280' | 'base' | 'unknown' => {
  if (!currentSrc) return 'unknown'

  const normalized = currentSrc.toLowerCase()
  if (normalized.includes('-960.webp')) return '960'
  if (normalized.includes('-1280.webp')) return '1280'
  if (normalized.includes('.webp')) return 'base'
  return 'unknown'
}

export default function CommissionImageNoticeGate() {
  const [enabled, setEnabled] = useState(false)
  const [initialNotice, setInitialNotice] = useState<InitialNotice>(null)
  const [NoticeClient, setNoticeClient] =
    useState<ComponentType<CommissionImageNoticeClientProps> | null>(() => cachedNoticeClient)

  useEffect(() => {
    const imageNodes = document.querySelectorAll<HTMLImageElement>(IMAGE_NODE_SELECTOR)
    const cleanupFns: Array<() => void> = []

    const trackImageLoadedVariant = (image: HTMLImageElement) => {
      const variant = detectLoadedVariant(image.currentSrc || image.src)
      const trackKey = `${variant}:${Math.round(window.devicePixelRatio || 1)}`
      if (!trackedVariantKeys.has(trackKey)) {
        trackedVariantKeys.add(trackKey)
        trackRybbitEvent(ANALYTICS_EVENTS.commissionImageVariantLoaded, {
          variant,
          dpr: Number((window.devicePixelRatio || 1).toFixed(2)),
          viewport_width: window.innerWidth,
        })
      }
    }

    imageNodes.forEach(image => {
      const onLoad = () => trackImageLoadedVariant(image)
      image.addEventListener('load', onLoad)

      if (image.complete && image.naturalWidth > 0) {
        trackImageLoadedVariant(image)
      }

      cleanupFns.push(() => {
        image.removeEventListener('load', onLoad)
      })
    })

    return () => {
      cleanupFns.forEach(cleanup => cleanup())
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
