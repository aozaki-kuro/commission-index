export interface CropPoint {
  x: number
  y: number
}

export interface CropSize {
  width: number
  height: number
}

export interface CropMediaSize extends CropSize {
  naturalWidth: number
  naturalHeight: number
}

export interface CropTransform {
  crop: CropPoint
  rotation: number
  zoom: number
}

interface CropGeometry {
  bleed: number
  cos: number
  extentX: number
  extentY: number
  minZoom: number
  sin: number
}

export const SOURCE_IMAGE_ASPECT = 1280 / 525
export const SOURCE_IMAGE_HEIGHT = 525
export const SOURCE_IMAGE_JPEG_QUALITY = 0.95
export const SOURCE_IMAGE_WIDTH = 1280

const OUTPUT_EDGE_BLEED = 2
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])
const SUPPORTED_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png)$/i

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getCropGeometry(
  mediaSize: CropSize,
  cropSize: CropSize,
  rotation: number,
): CropGeometry {
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfWidth = cropSize.width / 2
  const halfHeight = cropSize.height / 2
  const extentX = Math.abs(cos) * halfWidth + Math.abs(sin) * halfHeight
  const extentY = Math.abs(sin) * halfWidth + Math.abs(cos) * halfHeight
  const outputScale = SOURCE_IMAGE_WIDTH / cropSize.width
  const bleed = OUTPUT_EDGE_BLEED / outputScale

  return {
    bleed,
    cos,
    extentX,
    extentY,
    minZoom: Math.max(
      2 * (extentX + bleed) / mediaSize.width,
      2 * (extentY + bleed) / mediaSize.height,
    ),
    sin,
  }
}

export function getMinimumCropZoom(
  mediaSize: CropSize,
  cropSize: CropSize,
  rotation: number,
) {
  return getCropGeometry(mediaSize, cropSize, rotation).minZoom
}

export function normalizeCropTransform(
  transform: CropTransform,
  mediaSize: CropSize,
  cropSize: CropSize,
): CropTransform {
  const geometry = getCropGeometry(mediaSize, cropSize, transform.rotation)
  const zoom = Math.max(transform.zoom, geometry.minZoom)
  const localX = geometry.cos * transform.crop.x + geometry.sin * transform.crop.y
  const localY = -geometry.sin * transform.crop.x + geometry.cos * transform.crop.y
  const limitX = Math.max(
    0,
    mediaSize.width * zoom / 2 - geometry.extentX - geometry.bleed,
  )
  const limitY = Math.max(
    0,
    mediaSize.height * zoom / 2 - geometry.extentY - geometry.bleed,
  )
  const constrainedX = clamp(localX, -limitX, limitX)
  const constrainedY = clamp(localY, -limitY, limitY)

  return {
    crop: {
      x: geometry.cos * constrainedX - geometry.sin * constrainedY,
      y: geometry.sin * constrainedX + geometry.cos * constrainedY,
    },
    rotation: transform.rotation,
    zoom,
  }
}

export function getCropUpscaleFactor(
  mediaSize: CropMediaSize,
  cropSize: CropSize,
  zoom: number,
) {
  const mediaScale = mediaSize.width / mediaSize.naturalWidth
  const outputScale = SOURCE_IMAGE_WIDTH / cropSize.width
  return Math.max(1, mediaScale * zoom * outputScale)
}

export function isSupportedSourceImage(file: File) {
  return SUPPORTED_IMAGE_TYPES.has(file.type) || SUPPORTED_IMAGE_EXTENSION_PATTERN.test(file.name)
}

export function setFileInputValue(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
}

function getJpegFileName(fileName: string) {
  const trimmed = fileName.trim()
  const extensionIndex = trimmed.lastIndexOf('.')
  const stem = extensionIndex > 0 ? trimmed.slice(0, extensionIndex) : trimmed
  return `${stem || 'source-image'}.jpg`
}

function loadImage(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The selected image could not be decoded.'))
    image.src = imageUrl
  })
}

interface ExportCroppedImageOptions {
  cropSize: CropSize
  fileName: string
  imageUrl: string
  mediaSize: CropMediaSize
  transform: CropTransform
}

export async function exportCroppedImage({
  cropSize,
  fileName,
  imageUrl,
  mediaSize,
  transform,
}: ExportCroppedImageOptions) {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = SOURCE_IMAGE_WIDTH
  canvas.height = SOURCE_IMAGE_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Image processing is not available in this browser.')
  }

  const outputScale = SOURCE_IMAGE_WIDTH / cropSize.width
  const mediaScale = mediaSize.width / image.naturalWidth

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.translate(
    canvas.width / 2 + transform.crop.x * outputScale,
    canvas.height / 2 + transform.crop.y * outputScale,
  )
  context.rotate(transform.rotation * Math.PI / 180)
  context.scale(
    mediaScale * transform.zoom * outputScale,
    mediaScale * transform.zoom * outputScale,
  )
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      result => result
        ? resolve(result)
        : reject(new Error('The browser could not encode the cropped image.')),
      'image/jpeg',
      SOURCE_IMAGE_JPEG_QUALITY,
    )
  })

  return new File([blob], getJpegFileName(fileName), {
    lastModified: Date.now(),
    type: 'image/jpeg',
  })
}
