import type { ComponentProps } from 'react'
import type { ImageCropDialog as ImageCropDialogComponent } from './ImageCropDialog'
import { useEffect, useState } from 'react'
import { FloatingNotice } from '../FloatingNotice'

type ImageCropDialogProps = ComponentProps<typeof ImageCropDialogComponent>

let cropDialogModule: Promise<typeof ImageCropDialogComponent> | null = null
// Kept outside React state: components must not be stored in state (react/static-components).
let loadedCropDialog: typeof ImageCropDialogComponent | null = null

// The cropper bundle is only needed once a file is picked. Cache success only:
// a failed chunk fetch must stay retryable on the next pick, not poison the session.
function loadImageCropDialog() {
  cropDialogModule ??= import('./ImageCropDialog').then(
    (module) => {
      loadedCropDialog = module.ImageCropDialog
      return module.ImageCropDialog
    },
    (error: unknown) => {
      cropDialogModule = null
      throw error
    },
  )
  return cropDialogModule
}

// Shows a notice (not a Dialog) while loading, so the form layout never shifts.
export function LazyImageCropDialog(props: ImageCropDialogProps) {
  const [isLoaded, setIsLoaded] = useState(loadedCropDialog !== null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    loadImageCropDialog().then(
      () => {
        if (active)
          setIsLoaded(true)
      },
      (error: unknown) => {
        console.error('[image-crop] failed to load image editor', error)
        if (active)
          setLoadError(error instanceof Error ? error.message : String(error))
      },
    )

    return () => {
      active = false
    }
  }, [])

  if (loadError) {
    return (
      <FloatingNotice tone="error" onDismiss={props.onCancel}>
        {`Image editor failed to load (${loadError}). Dismiss and choose the image again.`}
      </FloatingNotice>
    )
  }

  if (!isLoaded || !loadedCropDialog) {
    return <FloatingNotice>Loading image editor…</FloatingNotice>
  }

  const CropDialog = loadedCropDialog
  return <CropDialog {...props} />
}
