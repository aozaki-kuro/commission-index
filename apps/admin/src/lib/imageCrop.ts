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

export interface CropSelection extends CropSize, CropPoint {}

export type CropMatrix = [number, number, number, number, number, number]

export interface CropImageGeometry {
  baseCenter: CropPoint
  matrix: CropMatrix
  size: CropSize
}

interface CropEditorResizeOptions {
  currentCanvasSize: CropSize
  image: CropImageGeometry
  nextCanvasSize: CropSize
  selection: CropSelection
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

function getSelectionCenter(selection: CropSelection) {
  return {
    x: selection.x + selection.width / 2,
    y: selection.y + selection.height / 2,
  }
}

function getMatrixTransform({ baseCenter, matrix }: CropImageGeometry) {
  const [a, b, , , e, f] = matrix

  return {
    center: {
      x: baseCenter.x + e,
      y: baseCenter.y + f,
    },
    rotation: Math.atan2(b, a),
    scale: Math.max(Math.hypot(a, b), Number.EPSILON),
  }
}

function getSelectionExtents(selection: CropSize, rotation: number) {
  const cos = Math.abs(Math.cos(rotation))
  const sin = Math.abs(Math.sin(rotation))

  return {
    bleed: OUTPUT_EDGE_BLEED * selection.width / SOURCE_IMAGE_WIDTH,
    x: cos * selection.width / 2 + sin * selection.height / 2,
    y: sin * selection.width / 2 + cos * selection.height / 2,
  }
}

export function isCropSelectionCovered(
  selection: CropSelection,
  image: CropImageGeometry,
  canvasSize?: CropSize,
) {
  if (
    selection.width <= 0
    || selection.height <= 0
    || (canvasSize && (
      selection.x < -1e-7
      || selection.y < -1e-7
      || selection.x + selection.width > canvasSize.width + 1e-7
      || selection.y + selection.height > canvasSize.height + 1e-7
    ))
  ) {
    return false
  }

  const frameCenter = getSelectionCenter(selection)
  const { center, rotation, scale } = getMatrixTransform(image)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const deltaX = frameCenter.x - center.x
  const deltaY = frameCenter.y - center.y
  const localX = cos * deltaX + sin * deltaY
  const localY = -sin * deltaX + cos * deltaY
  const extents = getSelectionExtents(selection, rotation)

  return Math.abs(localX) + extents.x + extents.bleed <= image.size.width * scale / 2 + 1e-7
    && Math.abs(localY) + extents.y + extents.bleed <= image.size.height * scale / 2 + 1e-7
}

export function normalizeCropImageMatrix(
  image: CropImageGeometry,
  selection: CropSelection,
): CropMatrix {
  const frameCenter = getSelectionCenter(selection)
  const { center, rotation, scale: requestedScale } = getMatrixTransform(image)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const extents = getSelectionExtents(selection, rotation)
  const scale = Math.max(
    requestedScale,
    2 * (extents.x + extents.bleed) / image.size.width,
    2 * (extents.y + extents.bleed) / image.size.height,
  )
  const deltaX = frameCenter.x - center.x
  const deltaY = frameCenter.y - center.y
  const localX = cos * deltaX + sin * deltaY
  const localY = -sin * deltaX + cos * deltaY
  const limitX = Math.max(0, image.size.width * scale / 2 - extents.x - extents.bleed)
  const limitY = Math.max(0, image.size.height * scale / 2 - extents.y - extents.bleed)
  const constrainedX = clamp(localX, -limitX, limitX)
  const constrainedY = clamp(localY, -limitY, limitY)
  const imageCenter = {
    x: frameCenter.x - (cos * constrainedX - sin * constrainedY),
    y: frameCenter.y - (sin * constrainedX + cos * constrainedY),
  }

  return [
    cos * scale,
    sin * scale,
    -sin * scale,
    cos * scale,
    imageCenter.x - image.baseCenter.x,
    imageCenter.y - image.baseCenter.y,
  ]
}

export function getMaximumCropSelectionWidth({
  aspectRatio,
  canvasSize,
  center,
  image,
}: {
  aspectRatio: number
  canvasSize: CropSize
  center: CropPoint
  image: CropImageGeometry
}) {
  const { center: imageCenter, rotation, scale } = getMatrixTransform(image)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const deltaX = center.x - imageCenter.x
  const deltaY = center.y - imageCenter.y
  const localX = Math.abs(cos * deltaX + sin * deltaY)
  const localY = Math.abs(-sin * deltaX + cos * deltaY)
  const bleedRate = OUTPUT_EDGE_BLEED / SOURCE_IMAGE_WIDTH
  const xRate = (Math.abs(cos) + Math.abs(sin) / aspectRatio) / 2 + bleedRate
  const yRate = (Math.abs(sin) + Math.abs(cos) / aspectRatio) / 2 + bleedRate
  const availableX = image.size.width * scale / 2 - localX
  const availableY = image.size.height * scale / 2 - localY
  const canvasWidth = 2 * Math.min(center.x, canvasSize.width - center.x)
  const canvasHeightWidth = 2 * aspectRatio * Math.min(center.y, canvasSize.height - center.y)

  return Math.max(0, Math.min(
    availableX / xRate,
    availableY / yRate,
    canvasWidth,
    canvasHeightWidth,
  ))
}

export function constrainCropSelectionChange({
  canvasSize,
  current,
  image,
  minimumWidth,
  requested,
}: {
  canvasSize: CropSize
  current: CropSelection
  image: CropImageGeometry
  minimumWidth: number
  requested: CropSelection
}) {
  const valid = (selection: CropSelection) => (
    selection.width >= minimumWidth
    && isCropSelectionCovered(selection, image, canvasSize)
  )

  if (valid(requested)) {
    return requested
  }

  let low = 0
  let high = 1
  let result = current

  for (let index = 0; index < 24; index += 1) {
    const ratio = (low + high) / 2
    const candidate = {
      height: current.height + (requested.height - current.height) * ratio,
      width: current.width + (requested.width - current.width) * ratio,
      x: current.x + (requested.x - current.x) * ratio,
      y: current.y + (requested.y - current.y) * ratio,
    }

    if (valid(candidate)) {
      result = candidate
      low = ratio
    }
    else {
      high = ratio
    }
  }

  return result
}

export function toCropTransform(
  image: CropImageGeometry,
  selection: CropSelection,
): CropTransform {
  const frameCenter = getSelectionCenter(selection)
  const { center, rotation, scale } = getMatrixTransform(image)

  return {
    crop: {
      x: center.x - frameCenter.x,
      y: center.y - frameCenter.y,
    },
    rotation: rotation * 180 / Math.PI,
    zoom: scale,
  }
}

export function resizeCropEditorState({
  currentCanvasSize,
  image,
  nextCanvasSize,
  selection,
}: CropEditorResizeOptions) {
  const scale = Math.min(
    nextCanvasSize.width / currentCanvasSize.width,
    nextCanvasSize.height / currentCanvasSize.height,
  )
  const currentCanvasCenter = {
    x: currentCanvasSize.width / 2,
    y: currentCanvasSize.height / 2,
  }
  const nextCanvasCenter = {
    x: nextCanvasSize.width / 2,
    y: nextCanvasSize.height / 2,
  }
  const resizePoint = ({ x, y }: CropPoint) => ({
    x: nextCanvasCenter.x + (x - currentCanvasCenter.x) * scale,
    y: nextCanvasCenter.y + (y - currentCanvasCenter.y) * scale,
  })
  const selectionCenter = resizePoint(getSelectionCenter(selection))
  const width = selection.width * scale
  const height = selection.height * scale
  const nextSelection = {
    height,
    width,
    x: selectionCenter.x - width / 2,
    y: selectionCenter.y - height / 2,
  }
  const imageCenter = resizePoint({
    x: image.baseCenter.x + image.matrix[4],
    y: image.baseCenter.y + image.matrix[5],
  })
  const nextImage = {
    ...image,
    matrix: [
      image.matrix[0] * scale,
      image.matrix[1] * scale,
      image.matrix[2] * scale,
      image.matrix[3] * scale,
      imageCenter.x - image.baseCenter.x,
      imageCenter.y - image.baseCenter.y,
    ] as CropMatrix,
  }

  return {
    image: {
      ...nextImage,
      matrix: normalizeCropImageMatrix(nextImage, nextSelection),
    },
    scale,
    selection: nextSelection,
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
