import { getAdminApiUrl } from './adminApi'

// A replaced source image keeps its URL, so previews in this tab bust the cache with the replacement time.
const previewImageVersionEvent = 'admin-preview-image-version'

interface PreviewImageVersionDetail {
  commissionId: number
  version: number
}

function getPreviewImageVersionStorageKey(commissionId: number) {
  return `admin-preview-image-version:${commissionId}`
}

export function getCommissionSourceImageUrl(commissionId: number, version = 0) {
  const url = getAdminApiUrl(`/api/admin/commissions/${commissionId}/source-image`)
  return version > 0
    ? `${url}?v=${version}`
    : url
}

export function readPreviewImageVersion(commissionId: number) {
  if (typeof window === 'undefined') {
    return 0
  }

  const parsed = Number(window.sessionStorage.getItem(getPreviewImageVersionStorageKey(commissionId)))
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : 0
}

export function publishPreviewImageVersion(commissionId: number, version: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(getPreviewImageVersionStorageKey(commissionId), String(version))
  window.dispatchEvent(new CustomEvent<PreviewImageVersionDetail>(previewImageVersionEvent, {
    detail: { commissionId, version },
  }))
}

export function subscribePreviewImageVersion(commissionId: number, onVersion: (version: number) => void) {
  const handlePreviewVersion = (event: Event) => {
    const detail = (event as CustomEvent<PreviewImageVersionDetail>).detail
    if (detail?.commissionId === commissionId) {
      onVersion(detail.version)
    }
  }

  window.addEventListener(previewImageVersionEvent, handlePreviewVersion)
  return () => window.removeEventListener(previewImageVersionEvent, handlePreviewVersion)
}
