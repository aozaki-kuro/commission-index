import type { CommissionRow } from '@commission-index/domain'
import { useEffect, useMemo, useState } from 'react'
import { getAdminApiUrl } from '../../lib/adminApi'
import {
  formatCommissionPublicId,
  getCommissionAccessibleLabel,
  getCommissionTitle,
} from '../../lib/commissionPresentation'

interface CommissionThumbnailGridProps {
  commissions: CommissionRow[]
  selectedCommissionId: number | null
  onSelect: (commission: CommissionRow) => void
}

function buildThumbnailSrc(commissionId: number) {
  return getAdminApiUrl(`/api/admin/commissions/${commissionId}/source-image`)
}

function ThumbnailCard({
  commission,
  isSelected,
  onSelect,
}: {
  commission: CommissionRow
  isSelected: boolean
  onSelect: () => void
}) {
  const [errorSrc, setErrorSrc] = useState<string | null>(null)
  const displayLabel = getCommissionTitle(commission)
  const accessibleLabel = getCommissionAccessibleLabel(commission)
  const imageSrc = useMemo(() => buildThumbnailSrc(commission.id), [commission.id])

  const [imageVersion, setImageVersion] = useState(() => {
    if (typeof window === 'undefined') {
      return 0
    }

    const stored = window.sessionStorage.getItem(`admin-preview-image-version:${commission.id}`)
    const parsed = Number(stored)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })

  useEffect(() => {
    const handlePreviewVersion = (event: Event) => {
      const detail = (event as CustomEvent<{ commissionId: number, version: number }>).detail
      if (detail?.commissionId === commission.id) {
        setErrorSrc(null)
        setImageVersion(detail.version)
      }
    }

    window.addEventListener('admin-preview-image-version', handlePreviewVersion)
    return () => window.removeEventListener('admin-preview-image-version', handlePreviewVersion)
  }, [commission.id])

  const previewSrc = imageVersion > 0 ? `${imageSrc}?v=${imageVersion}` : imageSrc

  return (
    <button
      type="button"
      data-commission-id={commission.id}
      onClick={onSelect}
      aria-label={accessibleLabel}
      title={`Public ID: ${commission.publicId}`}
      className={`
        group overflow-hidden rounded-lg border text-left transition
        hover:shadow-md
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
      <div className="
        aspect-1280/525 w-full overflow-hidden bg-gray-50
        dark:bg-gray-900/30
      "
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
          : (
              <img
                src={previewSrc}
                alt={`Source image for ${accessibleLabel}`}
                loading="lazy"
                decoding="async"
                className="
                  size-full object-contain transition
                  motion-safe:group-hover:scale-[1.02]
                "
                onError={() => setErrorSrc(imageSrc)}
              />
            )}
      </div>

      <div className={`
        px-2 py-1.5
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
          truncate text-xs font-medium
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
          flex items-center justify-between gap-2 text-xs text-gray-400
          dark:text-gray-500
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
    <div className="
      grid grid-cols-2 gap-3
      sm:grid-cols-3
    "
    >
      {commissions.map(commission => (
        <ThumbnailCard
          key={commission.id}
          commission={commission}
          isSelected={selectedCommissionId === commission.id}
          onSelect={() => onSelect(commission)}
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
    <div className="
      grid grid-cols-2 gap-3
      sm:grid-cols-3
    "
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="
            aspect-1280/525 w-full motion-safe:animate-pulse bg-gray-200/80
            dark:bg-gray-800
          "
          />
          <div className="px-2 py-1.5">
            <div className="
              h-4 w-3/4 motion-safe:animate-pulse rounded bg-gray-200/80
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
