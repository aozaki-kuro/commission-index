import type { CropEditorState } from '../../lib/imageCrop'
import type { ImageCropSnapshot, ImageCropWorkspaceHandle } from './ImageCropWorkspace'
import {
  IconAlertTriangle,
  IconArrowsHorizontal,
  IconBucketDroplet,
  IconCrop,
  IconRefresh,
  IconRotate2,
  IconRotateClockwise2,
} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { buttonStyles } from '../../app/ui'
import {
  DEFAULT_CROP_FILL_COLOR,
  exportCroppedImage,
  getCropOverflowAxis,
  getCropUpscaleFactor,
  sampleOverflowFillColor,
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
  initialEditorState?: CropEditorState
  onCancel: () => void
  onConfirm: (file: File, editorState: CropEditorState | null) => void
}

export function ImageCropDialog({
  file,
  initialEditorState,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const closeActionRef = useRef<(() => void) | null>(null)
  const [isOpen, setIsOpen] = useState(true)
  const revokeTimerRef = useRef<number | null>(null)
  const workspaceRef = useRef<ImageCropWorkspaceHandle>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl] = useState(() => URL.createObjectURL(file))
  const [isProcessing, setIsProcessing] = useState(false)
  const [snapshot, setSnapshot] = useState<ImageCropSnapshot | null>(null)
  const [allowOverflow, setAllowOverflow] = useState(initialEditorState?.allowOverflow ?? false)
  const [matchedFill, setMatchedFill] = useState(initialEditorState?.fillColor ?? DEFAULT_CROP_FILL_COLOR)
  const [isSamplingFill, setIsSamplingFill] = useState(false)
  // Without overflow the frame never shows empty area, so only transparent pixels see the fill: keep them white.
  const fillColor = allowOverflow
    ? matchedFill
    : DEFAULT_CROP_FILL_COLOR
  const isFillMatched = fillColor !== DEFAULT_CROP_FILL_COLOR

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
  // Saving mid-sample would export the previous fill.
  const canSave = Boolean(snapshot && !error && !isProcessing && !isSamplingFill && isOpen)

  // 先让 Radix 完成退场，再通知父组件清理文件和卸载对话框。
  const closeWithAction = (action: () => void) => {
    if (closeActionRef.current)
      return
    closeActionRef.current = action
    setIsOpen(false)
  }

  const handleCancel = () => {
    if (!isProcessing)
      closeWithAction(onCancel)
  }

  const handleSave = async () => {
    if (!snapshot || !canSave)
      return

    setError(null)
    setIsProcessing(true)
    const editorState = workspaceRef.current?.getEditorState() ?? null

    try {
      const output = await exportCroppedImage({
        cropSize: snapshot.cropSize,
        fileName: file.name,
        fillColor,
        imageUrl,
        mediaSize: snapshot.mediaSize,
        transform: snapshot.transform,
      })
      closeWithAction(() => onConfirm(output, editorState))
    }
    catch (caughtError) {
      setError(caughtError instanceof Error
        ? caughtError.message
        : 'Unable to process this image.')
    }
    finally {
      setIsProcessing(false)
    }
  }

  const toggleMatchedFill = async () => {
    if (!snapshot)
      return
    if (isFillMatched) {
      setMatchedFill(DEFAULT_CROP_FILL_COLOR)
      return
    }

    setIsSamplingFill(true)
    try {
      const { mediaSize, rotation } = snapshot
      const axis = getCropOverflowAxis({ height: mediaSize.height, width: mediaSize.width }, rotation * Math.PI / 180)
      setMatchedFill(await sampleOverflowFillColor(imageUrl, axis))
    }
    catch (caughtError) {
      setError(caughtError instanceof Error
        ? caughtError.message
        : 'Unable to sample the image background.')
    }
    finally {
      setIsSamplingFill(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open)
          handleCancel()
      }}
    >
      <DialogContent
        variant="crop"
        aria-describedby={undefined}
        onPointerDownOutside={event => event.preventDefault()}
        onCloseAutoFocus={() => {
          const action = closeActionRef.current
          closeActionRef.current = null
          action?.()
        }}
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
            allowOverflow={allowOverflow}
            fillColor={fillColor}
            imageUrl={imageUrl}
            initialState={initialEditorState}
            onChange={(nextSnapshot) => {
              setError(null)
              setSnapshot(nextSnapshot)
            }}
            onError={setError}
          />

          <div className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/35 bg-black/45 px-3 py-1.5 text-center text-2xs leading-tight text-white shadow-sm backdrop-blur-md sm:top-4">
            Drag image · pull frame edges · wheel or pinch · twist or use the rotation handle
          </div>
        </div>

        <div className="shrink-0 border-t border-white/45 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#1c1c1e] sm:px-6 sm:pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => workspaceRef.current?.rotateBy(-90)}
              disabled={!snapshot || isProcessing}
              aria-label="Rotate image left 90 degrees"
              title="Rotate left 90°"
              className={buttonStyles.ghost}
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
              className={buttonStyles.ghost}
            >
              <IconRotateClockwise2 className="size-4" stroke={1.8} aria-hidden="true" />
              <span className="hidden sm:inline">+90°</span>
            </button>
            <button
              type="button"
              onClick={() => workspaceRef.current?.fitCrop()}
              disabled={!snapshot || isProcessing}
              className={buttonStyles.ghost}
            >
              <IconCrop className="size-4" stroke={1.8} aria-hidden="true" />
              Fit
            </button>
            <button
              type="button"
              onClick={() => workspaceRef.current?.reset()}
              disabled={!snapshot || isProcessing}
              aria-label="Reset"
              title="Reset crop"
              className={buttonStyles.ghost}
            >
              <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
              {/* Icon-only on narrow screens so the toolbar keeps two rows at 200% text. */}
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              type="button"
              aria-pressed={allowOverflow}
              onClick={() => setAllowOverflow(current => !current)}
              disabled={!snapshot || isProcessing}
              aria-label="Extend frame past image"
              title="Let the frame extend past the image"
              className={buttonStyles.ghostToggle}
            >
              <IconArrowsHorizontal className="size-4" stroke={1.8} aria-hidden="true" />
              <span className="hidden sm:inline">Extend</span>
            </button>
            {allowOverflow
              ? (
                  <button
                    type="button"
                    aria-pressed={isFillMatched}
                    onClick={toggleMatchedFill}
                    disabled={!snapshot || isProcessing || isSamplingFill}
                    aria-label="Fill empty area with the image's edge colour"
                    title="Fill the empty area with the colour along the image edges"
                    className={buttonStyles.ghostToggle}
                  >
                    {/* The swatch badges the icon instead of sitting beside it, so the narrow toolbar keeps its width. */}
                    <span className="relative inline-flex">
                      <IconBucketDroplet className="size-4" stroke={1.8} aria-hidden="true" />
                      <span
                        aria-hidden="true"
                        className="absolute -right-1 -bottom-1 size-2 rounded-full border border-gray-400 dark:border-gray-500"
                        style={{ backgroundColor: fillColor }}
                      />
                    </span>
                    <span className="hidden sm:inline">Match edges</span>
                  </button>
                )
              : null}

            <output
              aria-label="Image rotation"
              aria-live="polite"
              className="rounded-md bg-black/5 px-2 py-1 text-xs tabular-nums text-gray-500 dark:bg-white/8 dark:text-gray-400"
            >
              {`${Math.round(snapshot?.rotation ?? 0)}°`}
            </output>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isProcessing}
                className={buttonStyles.secondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className={`${buttonStyles.primary} min-w-28`}
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
                      {allowOverflow
                        ? `The frame may pass the image edge; empty area exports ${isFillMatched
                          ? 'in the edge colour'
                          : 'white'}.`
                        : 'The frame keeps its output ratio and never extends beyond the rotated image.'}
                    </p>
                  )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
