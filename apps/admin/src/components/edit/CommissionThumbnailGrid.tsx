import type { CommissionRow } from '@commission-index/domain'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getAdminApiUrl } from '../../lib/adminApi'
import {
  formatCommissionPublicId,
  getCommissionAccessibleLabel,
  getCommissionTitle,
} from '../../lib/commissionPresentation'

const gridStyles = 'grid grid-cols-2 gap-3 @min-[40rem]/thumbnails:grid-cols-3 @min-[62rem]/thumbnails:grid-cols-4 @min-[78rem]/thumbnails:grid-cols-5'

/** Source images are 1280×525; reserve the same box before/after load for stable lazy layout. */
const thumbnailImageWidth = 1280
const thumbnailImageHeight = 525
/** Only start fetching an image once its card is (nearly) on screen. */
const thumbnailViewportMargin = '200px'

interface CommissionThumbnailGridProps {
  commissions: CommissionRow[]
  selectedCommissionId: number | null
  onSelect: (commission: CommissionRow) => void
  isExpanded: boolean
}

function buildThumbnailSrc(commissionId: number) {
  return getAdminApiUrl(`/api/admin/commissions/${commissionId}/source-image`)
}

// Do not render an image or its src while collapsed or far from the viewport.
// Environments without IntersectionObserver fall back to native lazy loading.
function useNearViewport<T extends HTMLElement>(isEnabled: boolean) {
  const ref = useRef<T | null>(null)
  const [isNear, setIsNear] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const node = ref.current
    if (!isEnabled || !node || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        setIsNear(true)
        observer.disconnect()
      }
    }, { rootMargin: thumbnailViewportMargin })

    observer.observe(node)
    return () => observer.disconnect()
  }, [isEnabled])

  return [ref, isNear] as const
}

/** Lazy source-image box shared by the thumbnail grid and search results. */
export function CommissionThumbnail({
  commissionId,
  alt,
  isEnabled,
  className = '',
}: {
  commissionId: number
  alt: string
  /** Gates fetching entirely (e.g. while the owning section is collapsed). */
  isEnabled: boolean
  className?: string
}) {
  const [errorSrc, setErrorSrc] = useState<string | null>(null)
  const imageSrc = useMemo(() => buildThumbnailSrc(commissionId), [commissionId])
  const [cardRef, isNearViewport] = useNearViewport<HTMLDivElement>(isEnabled)

  const [imageVersion, setImageVersion] = useState(() => {
    if (typeof window === 'undefined') {
      return 0
    }

    const stored = window.sessionStorage.getItem(`admin-preview-image-version:${commissionId}`)
    const parsed = Number(stored)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })

  useEffect(() => {
    const handlePreviewVersion = (event: Event) => {
      const detail = (event as CustomEvent<{ commissionId: number, version: number }>).detail
      if (detail?.commissionId === commissionId) {
        setErrorSrc(null)
        setImageVersion(detail.version)
      }
    }

    window.addEventListener('admin-preview-image-version', handlePreviewVersion)
    return () => window.removeEventListener('admin-preview-image-version', handlePreviewVersion)
  }, [commissionId])

  const previewSrc = imageVersion > 0 ? `${imageSrc}?v=${imageVersion}` : imageSrc

  // Retry the same URL once by remounting the image, then show the fallback.
  const [retriedSrc, setRetriedSrc] = useState<string | null>(null)
  const shouldRenderImage = isEnabled && isNearViewport && errorSrc !== imageSrc
  const handleImageError = () => {
    if (retriedSrc !== previewSrc) {
      setRetriedSrc(previewSrc)
      return
    }
    setErrorSrc(imageSrc)
  }

  return (
    <div
      ref={cardRef}
      className={`
        aspect-1280/525 w-full overflow-hidden bg-gray-50
        dark:bg-gray-900/30
        ${className}
      `}
    >
      {errorSrc === imageSrc
        ? (
            <div className="
              flex size-full items-center justify-center text-xs text-gray-400
              dark:text-gray-500
            "
            >
              No image
            </div>
          )
        : shouldRenderImage
          ? (
              <img
                key={retriedSrc === previewSrc ? 'retry' : 'initial'}
                src={previewSrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                width={thumbnailImageWidth}
                height={thumbnailImageHeight}
                className="
                  size-full object-contain transition
                  motion-safe:group-hover:scale-[1.02]
                "
                onError={handleImageError}
              />
            )
          : null}
    </div>
  )
}

function ThumbnailCard({
  commission,
  isSelected,
  onSelect,
  isExpanded,
}: {
  commission: CommissionRow
  isSelected: boolean
  onSelect: () => void
  isExpanded: boolean
}) {
  const displayLabel = getCommissionTitle(commission)
  const accessibleLabel = getCommissionAccessibleLabel(commission)
  const hasBeenExpandedRef = useRef(isExpanded)
  if (isExpanded) {
    hasBeenExpandedRef.current = true
  }
  const hasBeenExpanded = hasBeenExpandedRef.current

  return (
    <button
      type="button"
      data-commission-id={commission.id}
      onClick={onSelect}
      aria-label={accessibleLabel}
      title={`Public ID: ${commission.publicId}`}
      className={`
        group min-w-0 overflow-hidden rounded-lg border text-left transition
        focus-visible:ring-2 focus-visible:ring-blue-500
        focus-visible:ring-offset-2 focus-visible:ring-offset-white
        focus-visible:outline-none
        dark:focus-visible:ring-offset-gray-900
        ${isSelected
      ? `
            border-blue-500 ring-2 ring-blue-500
            dark:border-blue-400 dark:ring-blue-400
          `
      : `
            border-gray-200
            hover:border-gray-300
            dark:border-gray-700
            dark:hover:border-gray-600
          `}
      `}
    >
      <CommissionThumbnail
        commissionId={commission.id}
        alt={`Source image for ${accessibleLabel}`}
        isEnabled={hasBeenExpanded}
      />

      <div className={`
        px-3 py-2
        ${isSelected
      ? `
            bg-blue-50
            dark:bg-blue-950/30
          `
      : `
            bg-white
            dark:bg-gray-900/40
          `}
      `}
      >
        <p className={`
          truncate text-sm font-medium
          ${isSelected
      ? `
              text-blue-700
              dark:text-blue-300
            `
      : `
              text-gray-700
              dark:text-gray-200
            `}
        `}
        >
          {displayLabel}
        </p>
        <p className="
          flex items-center justify-between gap-2 text-xs text-gray-500
          dark:text-gray-400
        "
        >
          <span>
            {commission.links.length}
            {' '}
            {commission.links.length === 1 ? 'link' : 'links'}
          </span>
          <span className="font-mono">{formatCommissionPublicId(commission.publicId)}</span>
        </p>
      </div>
    </button>
  )
}

export function CommissionThumbnailGrid({
  commissions,
  selectedCommissionId,
  onSelect,
  isExpanded,
}: CommissionThumbnailGridProps) {
  if (commissions.length === 0) {
    return (
      <p className="
        py-4 text-sm text-gray-500
        dark:text-gray-300
      "
      >
        No commissions recorded yet.
      </p>
    )
  }

  return (
    <div className={gridStyles}>
      {commissions.map(commission => (
        <ThumbnailCard
          key={commission.id}
          commission={commission}
          isSelected={selectedCommissionId === commission.id}
          onSelect={() => onSelect(commission)}
          isExpanded={isExpanded}
        />
      ))}
    </div>
  )
}

export function CommissionThumbnailGridSkeleton({ count }: { count: number }) {
  if (count === 0) {
    return <p className="py-4 text-sm text-gray-500 dark:text-gray-300">No commissions recorded yet.</p>
  }

  return (
    <div className={gridStyles}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="
            aspect-1280/525 w-full motion-safe:animate-pulse bg-gray-200/80
            dark:bg-gray-800
          "
          />
          <div className="px-3 py-2">
            <div className="
              h-5 w-3/4 motion-safe:animate-pulse rounded bg-gray-200/80
              dark:bg-gray-800
            "
            />
            <div className="
              h-4 w-1/3 motion-safe:animate-pulse rounded bg-gray-200/80
              dark:bg-gray-800
            "
            />
          </div>
        </div>
      ))}
    </div>
  )
}
