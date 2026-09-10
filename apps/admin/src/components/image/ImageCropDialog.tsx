import type { ChangeEvent } from 'react'
import type {
  CropMediaSize,
  CropSize,
  CropTransform,
} from '../../lib/imageCrop'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import {
  exportCroppedImage,
  getCropUpscaleFactor,
  getMinimumCropZoom,
  normalizeCropTransform,
  SOURCE_IMAGE_ASPECT,
  SOURCE_IMAGE_HEIGHT,
  SOURCE_IMAGE_JPEG_QUALITY,
  SOURCE_IMAGE_WIDTH,
} from '../../lib/imageCrop'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

interface ImageCropDialogProps {
  file: File
  onCancel: () => void
  onConfirm: (file: File) => void
}

const INITIAL_TRANSFORM: CropTransform = {
  crop: { x: 0, y: 0 },
  rotation: 0,
  zoom: 1,
}

function formatZoom(value: number) {
  return `${value.toFixed(2)}×`
}

export function ImageCropDialog({
  file,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const cropSizeRef = useRef<CropSize | null>(null)
  const hostSizeRef = useRef<CropSize | null>(null)
  const revokeTimerRef = useRef<number | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [cropSize, setCropSize] = useState<CropSize | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl] = useState(() => URL.createObjectURL(file))
  const [isProcessing, setIsProcessing] = useState(false)
  const [mediaSize, setMediaSize] = useState<CropMediaSize | null>(null)
  const [transform, setTransform] = useState<CropTransform>(INITIAL_TRANSFORM)

  useEffect(() => {
    if (revokeTimerRef.current !== null) {
      window.clearTimeout(revokeTimerRef.current)
      revokeTimerRef.current = null
    }

    return () => {
      revokeTimerRef.current = window.setTimeout(() => {
        URL.revokeObjectURL(imageUrl)
        revokeTimerRef.current = null
      }, 0)
    }
  }, [imageUrl])

  const handleCropperHostRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    hostSizeRef.current = null

    if (!node) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return
      }

      const nextHostSize = {
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      }
      const previousHostSize = hostSizeRef.current
      hostSizeRef.current = nextHostSize

      if (
        previousHostSize
        && (Math.abs(previousHostSize.width - nextHostSize.width) > 0.5
          || Math.abs(previousHostSize.height - nextHostSize.height) > 0.5)
      ) {
        cropSizeRef.current = null
        setCropSize(null)
      }
    })
    observer.observe(node)
    resizeObserverRef.current = observer
  }, [])

  useEffect(() => {
    return () => resizeObserverRef.current?.disconnect()
  }, [])

  const normalize = useCallback((nextTransform: CropTransform) => {
    if (!mediaSize || !cropSize) {
      return nextTransform
    }

    return normalizeCropTransform(nextTransform, mediaSize, cropSize)
  }, [cropSize, mediaSize])

  const minimumZoom = useMemo(() => {
    if (!mediaSize || !cropSize) {
      return 0.1
    }

    return getMinimumCropZoom(mediaSize, cropSize, transform.rotation)
  }, [cropSize, mediaSize, transform.rotation])
  const maximumZoom = Math.max(6, minimumZoom * 4, minimumZoom + 4)
  const upscaleFactor = mediaSize && cropSize
    ? getCropUpscaleFactor(mediaSize, cropSize, transform.zoom)
    : 1
  const isUpscaling = upscaleFactor > 1.005
  const canSave = Boolean(imageUrl && mediaSize && cropSize && !error && !isProcessing)

  const updateTransform = useCallback((patch: Partial<CropTransform>) => {
    setTransform(current => normalize({ ...current, ...patch }))
  }, [normalize])

  const handleZoomChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateTransform({ zoom: Number(event.target.value) })
  }

  const handleRotationChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateTransform({ rotation: Number(event.target.value) })
  }

  const handleReset = () => {
    setTransform(normalize(INITIAL_TRANSFORM))
  }

  const handleMediaLoaded = (nextMediaSize: CropMediaSize) => {
    setMediaSize(nextMediaSize)
    if (cropSize) {
      setTransform(current => normalizeCropTransform(current, nextMediaSize, cropSize))
    }
  }

  const handleCropSizeChange = (nextCropSize: CropSize) => {
    const currentCropSize = cropSizeRef.current
    if (
      currentCropSize
      && Math.abs(currentCropSize.width - nextCropSize.width) <= 0.5
      && Math.abs(currentCropSize.height - nextCropSize.height) <= 0.5
    ) {
      return
    }

    cropSizeRef.current = nextCropSize
    setCropSize(nextCropSize)
    if (mediaSize) {
      setTransform(current => normalizeCropTransform(current, mediaSize, nextCropSize))
    }
  }

  const handleSave = async () => {
    if (!mediaSize || !cropSize || !canSave) {
      return
    }

    setError(null)
    setIsProcessing(true)

    try {
      const output = await exportCroppedImage({
        cropSize,
        fileName: file.name,
        imageUrl,
        mediaSize,
        transform: normalize(transform),
      })
      onConfirm(output)
    }
    catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to process this image.')
    }
    finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isProcessing) {
          onCancel()
        }
      }}
    >
      <DialogContent
        variant="crop"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (isProcessing) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader className="gap-4">
          <DialogTitle>
            <span className="block text-base font-semibold text-gray-900 dark:text-gray-100">
              Crop source image
            </span>
            <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
              {`${SOURCE_IMAGE_WIDTH}×${SOURCE_IMAGE_HEIGHT} JPG · ${SOURCE_IMAGE_JPEG_QUALITY * 100}% quality`}
            </span>
          </DialogTitle>
          <DialogCloseButton />
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-neutral-950">
          <div ref={handleCropperHostRef} className="absolute inset-4 sm:inset-6">
            {imageUrl
              ? (
                  <Cropper
                    image={imageUrl}
                    crop={transform.crop}
                    cropSize={cropSize ?? undefined}
                    zoom={transform.zoom}
                    rotation={transform.rotation}
                    aspect={SOURCE_IMAGE_ASPECT}
                    minZoom={minimumZoom}
                    maxZoom={maximumZoom}
                    restrictPosition={false}
                    zoomWithScroll={false}
                    showGrid
                    onCropChange={crop => updateTransform({ crop })}
                    onZoomChange={zoom => updateTransform({ zoom })}
                    onCropSizeChange={handleCropSizeChange}
                    onMediaLoaded={handleMediaLoaded}
                    mediaProps={{
                      onError: () => setError('The selected image could not be decoded.'),
                    }}
                    cropperProps={{
                      'aria-label': 'Drag to position the image inside the fixed crop frame',
                    }}
                    style={{
                      cropAreaStyle: {
                        border: '1px solid rgb(255 255 255 / 0.92)',
                        boxShadow: '0 0 0 9999em rgb(0 0 0 / 0.58)',
                      },
                    }}
                  />
                )
              : (
                  <div className="flex size-full items-center justify-center text-sm text-white/60">
                    Loading image…
                  </div>
                )}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6">
            <label className="grid gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span className="flex items-center justify-between gap-3">
                <span>Zoom</span>
                <output className="font-mono font-normal tabular-nums text-gray-500 dark:text-gray-400">
                  {formatZoom(transform.zoom)}
                </output>
              </span>
              <input
                type="range"
                min={minimumZoom}
                max={maximumZoom}
                step="0.01"
                value={Math.min(maximumZoom, Math.max(minimumZoom, transform.zoom))}
                onChange={handleZoomChange}
                aria-label="Zoom image"
                className="h-6 w-full accent-[#9d3757]"
              />
            </label>

            <label className="grid gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span className="flex items-center justify-between gap-3">
                <span>Rotation</span>
                <output className="font-mono font-normal tabular-nums text-gray-500 dark:text-gray-400">
                  {`${Math.round(transform.rotation)}°`}
                </output>
              </span>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={transform.rotation}
                onChange={handleRotationChange}
                aria-label="Rotate image"
                className="h-6 w-full accent-[#9d3757]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
            <button
              type="button"
              onClick={handleReset}
              disabled={!mediaSize || !cropSize || isProcessing}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
              Reset
            </button>

            <div className="w-full min-w-0 flex-1 sm:w-auto sm:min-w-48" aria-live="polite">
              {error
                ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                : isUpscaling
                  ? (
                      <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <IconAlertTriangle className="size-4 shrink-0" stroke={1.8} aria-hidden="true" />
                        {`This crop will be enlarged ${upscaleFactor.toFixed(2)}× and may look softer.`}
                      </p>
                    )
                  : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Transparent pixels are flattened onto white when saving as JPG.
                      </p>
                    )}
            </div>

            <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
              <button
                type="button"
                onClick={onCancel}
                disabled={isProcessing}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="inline-flex h-10 min-w-28 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {isProcessing ? 'Processing…' : 'Use image'}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
