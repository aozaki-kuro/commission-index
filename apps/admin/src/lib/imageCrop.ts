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
  allowOverflow?: boolean
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

export type CropAxis = 'x' | 'y'

export const DEFAULT_CROP_FILL_COLOR = '#ffffff'

// Overflow mode keeps exact containment on one image-local axis and lets the frame extend past the image on the
// other. The relaxed axis is whichever allows the larger frame at this rotation (0° on a 4:3 image relaxes the
// width, 90° relaxes the height). It depends on rotation and image proportions only, never on position, so the
// valid set stays convex for constrainCropSelectionChange's bisection.
export function getCropOverflowAxis(size: CropSize, rotation: number): CropAxis {
  const cos = Math.abs(Math.cos(rotation))
  const sin = Math.abs(Math.sin(rotation))
  const widthKeepingHeight = size.height / (sin + cos / SOURCE_IMAGE_ASPECT)
  const widthKeepingWidth = size.width / (cos + sin / SOURCE_IMAGE_ASPECT)
  return widthKeepingHeight >= widthKeepingWidth
    ? 'x'
    : 'y'
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

// On the relaxed overflow axis the frame centre must stay over the image, so the frame cannot drift off it.
function getLocalOffsetLimits(
  image: CropImageGeometry,
  selection: CropSize,
  rotation: number,
  scale: number,
  allowOverflow: boolean,
) {
  const extents = getSelectionExtents(selection, rotation)
  const relaxed = allowOverflow
    ? getCropOverflowAxis(image.size, rotation)
    : null
  const halfWidth = image.size.width * scale / 2
  const halfHeight = image.size.height * scale / 2

  return {
    x: relaxed === 'x'
      ? halfWidth
      : halfWidth - extents.x - extents.bleed,
    y: relaxed === 'y'
      ? halfHeight
      : halfHeight - extents.y - extents.bleed,
  }
}

export function isCropSelectionCovered(
  selection: CropSelection,
  image: CropImageGeometry,
  canvasSize?: CropSize,
  allowOverflow = false,
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
  const limits = getLocalOffsetLimits(image, selection, rotation, scale, allowOverflow)

  return Math.abs(localX) <= limits.x + 1e-7
    && Math.abs(localY) <= limits.y + 1e-7
}

export function normalizeCropImageMatrix(
  image: CropImageGeometry,
  selection: CropSelection,
  allowOverflow = false,
): CropMatrix {
  const frameCenter = getSelectionCenter(selection)
  const { center, rotation, scale: requestedScale } = getMatrixTransform(image)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const extents = getSelectionExtents(selection, rotation)
  const relaxed = allowOverflow
    ? getCropOverflowAxis(image.size, rotation)
    : null
  const scale = Math.max(
    requestedScale,
    relaxed === 'x'
      ? 0
      : 2 * (extents.x + extents.bleed) / image.size.width,
    relaxed === 'y'
      ? 0
      : 2 * (extents.y + extents.bleed) / image.size.height,
  )
  const deltaX = frameCenter.x - center.x
  const deltaY = frameCenter.y - center.y
  const localX = cos * deltaX + sin * deltaY
  const localY = -sin * deltaX + cos * deltaY
  const limits = getLocalOffsetLimits(image, selection, rotation, scale, allowOverflow)
  const limitX = Math.max(0, limits.x)
  const limitY = Math.max(0, limits.y)
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

interface CropWidthOptions {
  allowOverflow?: boolean
  aspectRatio: number
  center: CropPoint
  image: CropImageGeometry
}

function getImageBoundSelectionWidth({
  allowOverflow = false,
  aspectRatio,
  center,
  image,
}: CropWidthOptions) {
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
  const relaxed = allowOverflow
    ? getCropOverflowAxis(image.size, rotation)
    : null
  // A relaxed axis never limits the width, as long as the frame centre is still over the image.
  const relaxedLimit = (available: number) => available >= -1e-7
    ? Number.POSITIVE_INFINITY
    : 0

  return Math.max(0, Math.min(
    relaxed === 'x'
      ? relaxedLimit(availableX)
      : availableX / xRate,
    relaxed === 'y'
      ? relaxedLimit(availableY)
      : availableY / yRate,
  ))
}

function getCanvasBoundSelectionWidth(aspectRatio: number, canvasSize: CropSize, center: CropPoint) {
  return Math.max(0, Math.min(
    2 * Math.min(center.x, canvasSize.width - center.x),
    2 * aspectRatio * Math.min(center.y, canvasSize.height - center.y),
  ))
}

export function getMaximumCropSelectionWidth(options: CropWidthOptions & { canvasSize: CropSize }) {
  return Math.min(
    getImageBoundSelectionWidth(options),
    getCanvasBoundSelectionWidth(options.aspectRatio, options.canvasSize, options.center),
  )
}

// An overflowing frame can be wider than the canvas at the current zoom; shrink the image around the frame
// centre until its largest overflow frame fits the canvas. Both bounds scale linearly with that zoom.
export function zoomImageToFitOverflowFrame(options: CropWidthOptions & { canvasSize: CropSize }): CropMatrix {
  const { image, center } = options
  const imageBound = getImageBoundSelectionWidth({ ...options, allowOverflow: true })
  const canvasBound = getCanvasBoundSelectionWidth(options.aspectRatio, options.canvasSize, center)
  if (!(imageBound > canvasBound) || !Number.isFinite(imageBound) || canvasBound <= 0)
    return image.matrix

  const factor = canvasBound / imageBound
  const [a, b, c, d, e, f] = image.matrix
  const imageCenter = { x: image.baseCenter.x + e, y: image.baseCenter.y + f }
  return [
    a * factor,
    b * factor,
    c * factor,
    d * factor,
    center.x + (imageCenter.x - center.x) * factor - image.baseCenter.x,
    center.y + (imageCenter.y - center.y) * factor - image.baseCenter.y,
  ]
}

export function constrainCropSelectionChange({
  allowOverflow = false,
  canvasSize,
  current,
  image,
  minimumWidth,
  requested,
}: {
  allowOverflow?: boolean
  canvasSize: CropSize
  current: CropSelection
  image: CropImageGeometry
  minimumWidth: number
  requested: CropSelection
}) {
  const valid = (selection: CropSelection) => (
    selection.width >= minimumWidth
    && isCropSelectionCovered(selection, image, canvasSize, allowOverflow)
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
  allowOverflow = false,
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
      matrix: normalizeCropImageMatrix(nextImage, nextSelection, allowOverflow),
    },
    scale,
    selection: nextSelection,
  }
}

// A confirmed crop, stored independently of the image element's layout origin so it can be
// re-applied in a later editor session whose canvas (and element offset) may differ.
export interface CropEditorState {
  // Restoring an overflowing frame without this would normalize it back inside the image.
  allowOverflow: boolean
  canvasSize: CropSize
  fillColor: string
  imageCenter: CropPoint
  linear: [number, number, number, number]
  preferredWidth: number
  selection: CropSelection
}

export function captureCropEditorState({
  allowOverflow,
  canvasSize,
  fillColor,
  image,
  preferredWidth,
  selection,
}: {
  allowOverflow: boolean
  canvasSize: CropSize
  fillColor: string
  image: CropImageGeometry
  preferredWidth: number
  selection: CropSelection
}): CropEditorState {
  const [a, b, c, d] = image.matrix
  return {
    allowOverflow,
    canvasSize,
    fillColor,
    imageCenter: getMatrixTransform(image).center,
    linear: [a, b, c, d],
    preferredWidth,
    selection,
  }
}

export function restoreCropEditorState(
  state: CropEditorState,
  image: CropImageGeometry,
  canvasSize: CropSize,
) {
  const [a, b, c, d] = state.linear
  const restored = resizeCropEditorState({
    allowOverflow: state.allowOverflow,
    currentCanvasSize: state.canvasSize,
    image: {
      ...image,
      matrix: [
        a,
        b,
        c,
        d,
        state.imageCenter.x - image.baseCenter.x,
        state.imageCenter.y - image.baseCenter.y,
      ],
    },
    nextCanvasSize: canvasSize,
    selection: state.selection,
  })
  return {
    ...restored,
    preferredWidth: state.preferredWidth * restored.scale,
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
  const stem = extensionIndex > 0
    ? trimmed.slice(0, extensionIndex)
    : trimmed
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

// Per-channel median of the image strips that border the overflow area: a coherent solid fill that ignores
// thin outliers (signatures, a stray line) better than a mean would. RGBA input, already flattened onto white.
export function getEdgeMedianColor(data: ArrayLike<number>, width: number, height: number, axis: CropAxis) {
  const strip = Math.max(1, Math.round((axis === 'x'
    ? width
    : height) * 0.02))
  const histograms = [
    new Uint32Array(256),
    new Uint32Array(256),
    new Uint32Array(256),
  ]
  let count = 0
  const add = (x: number, y: number) => {
    const offset = (y * width + x) * 4
    for (let channel = 0; channel < 3; channel += 1)
      histograms[channel][data[offset + channel]] += 1
    count += 1
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onEdge = axis === 'x'
        ? x < strip || x >= width - strip
        : y < strip || y >= height - strip
      if (onEdge)
        add(x, y)
    }
  }

  const median = (histogram: Uint32Array) => {
    let seen = 0
    for (let value = 0; value < 256; value += 1) {
      seen += histogram[value]
      if (seen * 2 >= count)
        return value
    }
    return 255
  }

  return `#${histograms.map(histogram => median(histogram).toString(16).padStart(2, '0')).join('')}`
}

export async function sampleOverflowFillColor(imageUrl: string, axis: CropAxis) {
  const image = await loadImage(imageUrl)
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    throw new Error('Image processing is not available in this browser.')

  // Matches the export, which flattens transparent pixels onto the fill.
  context.fillStyle = DEFAULT_CROP_FILL_COLOR
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  return getEdgeMedianColor(data, canvas.width, canvas.height, axis)
}

interface ExportCroppedImageOptions {
  cropSize: CropSize
  fileName: string
  fillColor?: string
  imageUrl: string
  mediaSize: CropMediaSize
  transform: CropTransform
}

export async function exportCroppedImage({
  cropSize,
  fileName,
  fillColor = DEFAULT_CROP_FILL_COLOR,
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

  context.fillStyle = fillColor
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
