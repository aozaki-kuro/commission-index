import { Skeleton } from '#components/ui/skeleton'
import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { useCallback, useId, useRef, useState } from 'react'

type ProtectedCommissionImageProps = {
  altText: string
  resolvedImageSrc: string
}

const COMMISSION_IMAGE_WIDTH = 1280
const COMMISSION_IMAGE_HEIGHT = 525
const COMMISSION_IMAGE_SIZES = '(max-width: 768px) 92vw, 640px'
const trackedVariantKeys = new Set<string>()

const buildResponsiveSrcSet = (src: string) => {
  const queryIndex = src.indexOf('?')
  const pathPart = queryIndex === -1 ? src : src.slice(0, queryIndex)
  const queryPart = queryIndex === -1 ? '' : src.slice(queryIndex)
  const extensionIndex = pathPart.lastIndexOf('.')

  if (extensionIndex === -1) {
    return ''
  }

  const stem = pathPart.slice(0, extensionIndex)
  const extension = pathPart.slice(extensionIndex)

  return [
    `${stem}-960${extension}${queryPart} 960w`,
    `${stem}-1280${extension}${queryPart} 1280w`,
  ].join(', ')
}

const detectLoadedVariant = (currentSrc: string): '960' | '1280' | 'base' | 'unknown' => {
  if (!currentSrc) return 'unknown'

  const normalized = currentSrc.toLowerCase()
  if (normalized.includes('-960.webp')) return '960'
  if (normalized.includes('-1280.webp')) return '1280'
  if (normalized.includes('.webp')) return 'base'
  return 'unknown'
}

const ProtectedCommissionImage = ({ altText, resolvedImageSrc }: ProtectedCommissionImageProps) => {
  const cacheBustId = useId()
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)

  const fallbackSrc =
    import.meta.env?.DEV && import.meta.env?.MODE !== 'test'
      ? `${resolvedImageSrc}${resolvedImageSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheBustId)}`
      : resolvedImageSrc

  const markLoaded = useCallback((src: string) => {
    setLoadedSrc(src)
    setErroredSrc(previous => (previous === src ? null : previous))
  }, [])
  const markError = useCallback((src: string) => {
    setErroredSrc(src)
  }, [])

  const resolveLoadedState = useCallback(
    async (node: HTMLImageElement | null, src: string) => {
      if (!node) return

      if (typeof node.decode === 'function') {
        try {
          await node.decode()
        } catch {
          if (!node.complete || node.naturalWidth === 0) {
            markError(src)
            return
          }
        }
      }

      if (node.naturalWidth > 0) {
        markLoaded(src)
        const variant = detectLoadedVariant(node.currentSrc || node.src)
        const trackKey = `${variant}:${Math.round(window.devicePixelRatio || 1)}`
        if (!trackedVariantKeys.has(trackKey)) {
          trackedVariantKeys.add(trackKey)
          trackRybbitEvent(ANALYTICS_EVENTS.commissionImageVariantLoaded, {
            variant,
            dpr: Number((window.devicePixelRatio || 1).toFixed(2)),
            viewport_width: window.innerWidth,
          })
        }
      } else {
        markError(src)
      }
    },
    [markError, markLoaded],
  )

  const attachImageRef = useCallback(
    (node: HTMLImageElement | null) => {
      imageRef.current = node
      // Cached images can finish before React binds onLoad during hydration.
      if (node?.complete) {
        void resolveLoadedState(node, fallbackSrc)
      }
    },
    [fallbackSrc, resolveLoadedState],
  )
  const hasError = erroredSrc === fallbackSrc
  const isLoaded = loadedSrc === fallbackSrc && !hasError
  const srcSet = buildResponsiveSrcSet(fallbackSrc)

  return (
    <div data-commission-image="true" data-commission-alt={altText} className="relative">
      {!isLoaded && !hasError ? (
        <Skeleton className="absolute inset-0 z-0 h-full w-full rounded-none" aria-hidden="true" />
      ) : null}
      {hasError ? (
        <div
          className="absolute inset-0 z-0 flex items-center justify-center bg-gray-200/80 text-xs text-gray-700 dark:bg-gray-700/60 dark:text-gray-200"
          aria-hidden="true"
        >
          image unavailable
        </div>
      ) : null}
      <img
        ref={attachImageRef}
        src={fallbackSrc}
        srcSet={srcSet || undefined}
        sizes={srcSet ? COMMISSION_IMAGE_SIZES : undefined}
        alt={altText}
        className={`pointer-events-none relative z-10 transition-opacity duration-300 select-none motion-reduce:transition-none ${
          isLoaded && !hasError ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        width={COMMISSION_IMAGE_WIDTH}
        height={COMMISSION_IMAGE_HEIGHT}
        style={{ width: '100%', height: 'auto' }}
        onLoad={e => {
          void resolveLoadedState(e.currentTarget, fallbackSrc)
        }}
        onError={() => {
          markError(fallbackSrc)
        }}
      />
    </div>
  )
}

export default ProtectedCommissionImage
