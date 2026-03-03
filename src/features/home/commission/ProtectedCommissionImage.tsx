import { ANALYTICS_EVENTS } from '#lib/analytics/events'
import { trackRybbitEvent } from '#lib/analytics/track'
import { useMemo, useState } from 'react'

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
  const [hasError, setHasError] = useState(false)
  const srcSet = useMemo(() => buildResponsiveSrcSet(resolvedImageSrc), [resolvedImageSrc])

  return (
    <div data-commission-image="true" data-commission-alt={altText} className="relative">
      {hasError ? (
        <div
          className="absolute inset-0 z-0 flex items-center justify-center bg-gray-200/80 text-xs text-gray-700 dark:bg-gray-700/60 dark:text-gray-200"
          aria-hidden="true"
        >
          image unavailable
        </div>
      ) : null}
      <img
        src={resolvedImageSrc}
        srcSet={srcSet || undefined}
        sizes={srcSet ? COMMISSION_IMAGE_SIZES : undefined}
        alt={altText}
        className={`pointer-events-none relative z-10 transition-opacity duration-300 select-none motion-reduce:transition-none ${
          hasError ? 'opacity-0' : 'opacity-100'
        }`}
        loading="lazy"
        width={COMMISSION_IMAGE_WIDTH}
        height={COMMISSION_IMAGE_HEIGHT}
        style={{ width: '100%', height: 'auto' }}
        onLoad={e => {
          if (hasError) setHasError(false)

          const variant = detectLoadedVariant(e.currentTarget.currentSrc || e.currentTarget.src)
          const trackKey = `${variant}:${Math.round(window.devicePixelRatio || 1)}`
          if (!trackedVariantKeys.has(trackKey)) {
            trackedVariantKeys.add(trackKey)
            trackRybbitEvent(ANALYTICS_EVENTS.commissionImageVariantLoaded, {
              variant,
              dpr: Number((window.devicePixelRatio || 1).toFixed(2)),
              viewport_width: window.innerWidth,
            })
          }
        }}
        onError={() => {
          setHasError(true)
        }}
      />
    </div>
  )
}

export default ProtectedCommissionImage
