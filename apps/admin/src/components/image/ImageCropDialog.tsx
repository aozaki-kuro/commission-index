import type { ImageCropSnapshot, ImageCropWorkspaceHandle } from './ImageCropWorkspace'
import {
  IconAlertTriangle,
  IconCrop,
  IconRefresh,
  IconRotate2,
  IconRotateClockwise2,
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import {
  exportCroppedImage,
  getCropUpscaleFactor,
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
import { ImageCropWorkspace } from './ImageCropWorkspace'

interface ImageCropDialogProps {
  file: File
  onCancel: () => void
  onConfirm: (file: File) => void
}

const toolButtonClass = `
  inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3
  text-sm font-medium text-gray-700 transition
  hover:bg-black/6 hover:text-gray-950
  focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:outline-none
  disabled:pointer-events-none disabled:opacity-45
  dark:text-gray-200 dark:hover:bg-white/9 dark:hover:text-white
`

export function ImageCropDialog({
  file,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const revokeTimerRef = useRef<number | null>(null)
  const workspaceRef = useRef<ImageCropWorkspaceHandle>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl] = useState(() => URL.createObjectURL(file))
  const [isProcessing, setIsProcessing] = useState(false)
  const [snapshot, setSnapshot] = useState<ImageCropSnapshot | null>(null)

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

  const upscaleFactor = snapshot
    ? getCropUpscaleFactor(snapshot.mediaSize, snapshot.cropSize, snapshot.transform.zoom)
    : 1
  const isUpscaling = upscaleFactor > 1.005
  const canSave = Boolean(snapshot && !error && !isProcessing)

  const handleSave = async () => {
    if (!snapshot || !canSave)
      return

    setError(null)
    setIsProcessing(true)

    try {
      const output = await exportCroppedImage({
        cropSize: snapshot.cropSize,
        fileName: file.name,
        imageUrl,
        mediaSize: snapshot.mediaSize,
        transform: snapshot.transform,
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
        if (!open && !isProcessing)
          onCancel()
      }}
    >
      <DialogContent
        variant="crop"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (isProcessing)
            event.preventDefault()
        }}
      >
        <DialogHeader className="gap-4 pt-[max(1rem,env(safe-area-inset-top))]">
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

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--crop-workspace)]">
          <ImageCropWorkspace
            ref={workspaceRef}
            imageUrl={imageUrl}
            onChange={(nextSnapshot) => {
              setError(null)
              setSnapshot(nextSnapshot)
            }}
            onError={setError}
          />

          <div className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/35 bg-black/45 px-3 py-1.5 text-center text-[11px] leading-tight text-white shadow-sm backdrop-blur-md sm:top-4">
            Drag image · pull frame edges · wheel or pinch · twist or use the rotation handle
          </div>
        </div>

        <div className="shrink-0 border-t border-white/45 bg-white/92 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/10 dark:bg-[#1c1c1e]/92 sm:px-6 sm:pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => workspaceRef.current?.rotateBy(-90)}
              disabled={!snapshot || isProcessing}
              aria-label="Rotate image left 90 degrees"
              title="Rotate left 90°"
              className={toolButtonClass}
            >
              <IconRotate2 className="size-4" stroke={1.8} aria-hidden="true" />
              <span className="hidden sm:inline">−90°</span>
            </button>
            <button
              type="button"
              onClick={() => workspaceRef.current?.rotateBy(90)}
              disabled={!snapshot || isProcessing}
              aria-label="Rotate image right 90 degrees"
              title="Rotate right 90°"
              className={toolButtonClass}
            >
              <IconRotateClockwise2 className="size-4" stroke={1.8} aria-hidden="true" />
              <span className="hidden sm:inline">+90°</span>
            </button>
            <button
              type="button"
              onClick={() => workspaceRef.current?.fitCrop()}
              disabled={!snapshot || isProcessing}
              className={toolButtonClass}
            >
              <IconCrop className="size-4" stroke={1.8} aria-hidden="true" />
              Fit
            </button>
            <button
              type="button"
              onClick={() => workspaceRef.current?.reset()}
              disabled={!snapshot || isProcessing}
              className={toolButtonClass}
            >
              <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
              Reset
            </button>

            <output
              aria-label="Image rotation"
              aria-live="polite"
              className="ml-1 rounded-md bg-black/5 px-2 py-1 font-mono text-xs tabular-nums text-gray-500 dark:bg-white/8 dark:text-gray-400"
            >
              {`${Math.round(snapshot?.rotation ?? 0)}°`}
            </output>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isProcessing}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/8"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {isProcessing ? 'Processing…' : 'Use image'}
              </button>
            </div>
          </div>

          <div className="mt-2 min-h-5" aria-live="polite">
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
                      The frame keeps its output ratio and never extends beyond the rotated image.
                    </p>
                  )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
