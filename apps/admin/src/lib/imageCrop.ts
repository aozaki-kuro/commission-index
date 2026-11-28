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
export const SOURCE_IMAGE_JPEG_QUALITY = 1
export const SOURCE_IMAGE_WIDTH = 1280

const MAX_PASSTHROUGH_BYTES = 10 * 1024 * 1024
const MAX_RESAMPLE_FACTOR = 4
const OUTPUT_EDGE_BLEED = 2
// Slack for accumulated float error in coverage comparisons, in canvas pixels.
const COVERAGE_TOLERANCE = 1e-7
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])
const SUPPORTED_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png)$/i
const JPEG_SOF_MARKERS = new Set([
  0xC0,
  0xC1,
  0xC2,
  0xC3,
  0xC5,
  0xC6,
  0xC7,
  0xC9,
  0xCA,
  0xCB,
  0xCD,
  0xCE,
  0xCF,
])

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getSelectionCenter(selection: CropSelection): CropPoint {
  return {
    x: selection.x + selection.width / 2,
    y: selection.y + selection.height / 2,
  }
}

// The output-ratio frame of the given width centred on a point.
export function getCenteredCropSelection(center: CropPoint, width: number): CropSelection {
  const height = width / SOURCE_IMAGE_ASPECT
  return {
    height,
    width,
    x: center.x - width / 2,
    y: center.y - height / 2,
  }
}

// A canvas point expressed along the image's own (rotated) axes, relative to the image centre.
function toImageLocal(point: CropPoint, imageCenter: CropPoint, rotation: number): CropPoint {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const deltaX = point.x - imageCenter.x
  const deltaY = point.y - imageCenter.y
  return {
    x: cos * deltaX + sin * deltaY,
    y: -sin * deltaX + cos * deltaY,
  }
}

function scaleMatrix(matrix: CropMatrix, factor: number, translate: CropPoint): CropMatrix {
  return [
    matrix[0] * factor,
    matrix[1] * factor,
    matrix[2] * factor,
    matrix[3] * factor,
    translate.x,
    translate.y,
  ]
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

function getRelaxedAxis(size: CropSize, rotation: number, allowOverflow: boolean) {
  return allowOverflow
    ? getCropOverflowAxis(size, rotation)
    : null
}

// Diagonal rotations cross pixel boundaries and need a 2px bleed to avoid antialiased white edge slivers;
// axis-aligned crops (0°/90°/180°/270°) align to pixel edges, so bleed would only force a 1.0076× upscale on 1280×525.
function getOutputEdgeBleed(rotation: number) {
  return Math.abs(Math.sin(2 * rotation)) < 1e-6
    ? 0
    : OUTPUT_EDGE_BLEED
}

function getSelectionExtents(selection: CropSize, rotation: number) {
  const cos = Math.abs(Math.cos(rotation))
  const sin = Math.abs(Math.sin(rotation))

  return {
    bleed: getOutputEdgeBleed(rotation) * selection.width / SOURCE_IMAGE_WIDTH,
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
  const relaxed = getRelaxedAxis(image.size, rotation, allowOverflow)
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
      selection.x < -COVERAGE_TOLERANCE
      || selection.y < -COVERAGE_TOLERANCE
      || selection.x + selection.width > canvasSize.width + COVERAGE_TOLERANCE
      || selection.y + selection.height > canvasSize.height + COVERAGE_TOLERANCE
    ))
  ) {
    return false
  }

  const { center, rotation, scale } = getMatrixTransform(image)
  const local = toImageLocal(getSelectionCenter(selection), center, rotation)
  const limits = getLocalOffsetLimits(image, selection, rotation, scale, allowOverflow)

  return Math.abs(local.x) <= limits.x + COVERAGE_TOLERANCE
    && Math.abs(local.y) <= limits.y + COVERAGE_TOLERANCE
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
  const relaxed = getRelaxedAxis(image.size, rotation, allowOverflow)
  const scale = Math.max(
    requestedScale,
    relaxed === 'x'
      ? 0
      : 2 * (extents.x + extents.bleed) / image.size.width,
    relaxed === 'y'
      ? 0
      : 2 * (extents.y + extents.bleed) / image.size.height,
  )
  const local = toImageLocal(frameCenter, center, rotation)
  // Limits come from the raised scale, so the frame is covered after the zoom-in, not before it.
  const limits = getLocalOffsetLimits(image, selection, rotation, scale, allowOverflow)
  const limitX = Math.max(0, limits.x)
  const limitY = Math.max(0, limits.y)
  const constrainedX = clamp(local.x, -limitX, limitX)
  const constrainedY = clamp(local.y, -limitY, limitY)
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

// Fit the opening image tightly onto the selection instead of leaving it at canvas-contain size,
// so an already-sized 1280×525 image opens at 1:1 with zero unintended crop or upscaling.
export function getInitialCropImageMatrix(
  image: CropImageGeometry,
  selection: CropSelection,
  allowOverflow = false,
): CropMatrix {
  const frameCenter = getSelectionCenter(selection)
  const scale = Math.max(
    selection.width / Math.max(image.size.width, Number.EPSILON),
    selection.height / Math.max(image.size.height, Number.EPSILON),
  )
  return normalizeCropImageMatrix({
    ...image,
    matrix: [
      scale,
      0,
      0,
      scale,
      frameCenter.x - image.baseCenter.x,
      frameCenter.y - image.baseCenter.y,
    ],
  }, selection, allowOverflow)
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
  const cos = Math.abs(Math.cos(rotation))
  const sin = Math.abs(Math.sin(rotation))
  const local = toImageLocal(center, imageCenter, rotation)
  const bleedRate = getOutputEdgeBleed(rotation) / SOURCE_IMAGE_WIDTH
  const xRate = (cos + sin / aspectRatio) / 2 + bleedRate
  const yRate = (sin + cos / aspectRatio) / 2 + bleedRate
  const availableX = image.size.width * scale / 2 - Math.abs(local.x)
  const availableY = image.size.height * scale / 2 - Math.abs(local.y)
  const relaxed = getRelaxedAxis(image.size, rotation, allowOverflow)
  // A relaxed axis never limits the width, as long as the frame centre is still over the image.
  const relaxedLimit = (available: number) => available >= -COVERAGE_TOLERANCE
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

// After the image rotates, the frame keeps its centre and takes the preferred width the new angle still allows.
// A frame already below the minimum is never forced to grow.
export function refitCropSelectionAfterRotation({
  allowOverflow,
  canvasSize,
  image,
  minimumWidth,
  preferredWidth,
  selection,
}: {
  allowOverflow: boolean
  canvasSize: CropSize
  image: CropImageGeometry
  minimumWidth: number
  preferredWidth: number
  selection: CropSelection
}) {
  const center = getSelectionCenter(selection)
  const maximumWidth = getMaximumCropSelectionWidth({
    allowOverflow,
    aspectRatio: SOURCE_IMAGE_ASPECT,
    canvasSize,
    center,
    image,
  })
  return getCenteredCropSelection(center, Math.max(
    Math.min(preferredWidth, maximumWidth),
    Math.min(minimumWidth, selection.width),
  ))
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
  const imageCenter = getMatrixTransform(image).center
  return scaleMatrix(image.matrix, factor, {
    x: center.x + (imageCenter.x - center.x) * factor - image.baseCenter.x,
    y: center.y + (imageCenter.y - center.y) * factor - image.baseCenter.y,
  })
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
  const imageCenter = resizePoint(getMatrixTransform(image).center)
  const nextImage = {
    ...image,
    matrix: scaleMatrix(image.matrix, scale, {
      x: imageCenter.x - image.baseCenter.x,
      y: imageCenter.y - image.baseCenter.y,
    }),
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

// The picked original is decoded on the main thread (Cropper preview, then canvas export/sampling), so a huge
// file can freeze or crash the tab. These caps only bound the original: the upload is always the small
// 1280×525 JPEG, which is why the worker's 10 MiB source-image limit does not apply here. 100 MP is far beyond
// any real artwork scan yet keeps a decoded RGBA bitmap around 400 MB.
export const MAX_SOURCE_IMAGE_FILE_BYTES = 100 * 1024 * 1024
export const MAX_SOURCE_IMAGE_PIXELS = 100_000_000

export function getSourceImageFileSizeError(file: Pick<File, 'size'>) {
  return file.size > MAX_SOURCE_IMAGE_FILE_BYTES
    ? 'This image is too large to edit (over 100 MB). Choose a smaller file.'
    : null
}

export function getSourceImagePixelCountError(naturalWidth: number, naturalHeight: number) {
  return naturalWidth * naturalHeight > MAX_SOURCE_IMAGE_PIXELS
    ? 'This image is too large to edit (over 100 megapixels). Resize it and try again.'
    : null
}

function loadImage(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      // Checked before any canvas work: drawImage is what forces the full decode.
      const sizeError = getSourceImagePixelCountError(image.naturalWidth, image.naturalHeight)
      if (sizeError)
        reject(new Error(sizeError))
      else
        resolve(image)
    }
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

export interface RawSourceImageHeader {
  format: 'jpeg' | 'png'
  hasNonDefaultOrientation: boolean
  height: number
  width: number
}

const PNG_SIGNATURE = [
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
]
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]

function hasExifNonDefaultOrientation(segment: Uint8Array) {
  if (segment.length < EXIF_HEADER.length || !EXIF_HEADER.every((byte, index) => segment[index] === byte)) {
    return false
  }

  const tiffBase = EXIF_HEADER.length
  if (segment.length < tiffBase + 8) {
    return true
  }

  const littleEndian = segment[tiffBase] === 0x49 && segment[tiffBase + 1] === 0x49
  const bigEndian = segment[tiffBase] === 0x4D && segment[tiffBase + 1] === 0x4D
  if (!littleEndian && !bigEndian) {
    return true
  }

  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength)
  if (view.getUint16(tiffBase + 2, littleEndian) !== 42) {
    return true
  }

  const ifdStart = tiffBase + view.getUint32(tiffBase + 4, littleEndian)
  if (ifdStart < tiffBase + 8 || ifdStart + 2 > segment.length) {
    return true
  }

  const entryCount = view.getUint16(ifdStart, littleEndian)
  if (ifdStart + 2 + entryCount * 12 > segment.length) {
    return true
  }

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdStart + 2 + index * 12
    if (view.getUint16(entryOffset, littleEndian) === 0x0112) {
      const type = view.getUint16(entryOffset + 2, littleEndian)
      const count = view.getUint32(entryOffset + 4, littleEndian)
      if (type !== 3 || count < 1) {
        return true
      }
      return view.getUint16(entryOffset + 8, littleEndian) !== 1
    }
  }

  return false
}

export function readRawSourceImageHeader(bytes: Uint8Array): RawSourceImageHeader | null {
  if (bytes.length >= 24 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    // IHDR must be the first chunk in a valid PNG (bytes 12..15).
    if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
      return null
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(16, false)
    const height = view.getUint32(20, false)
    return width > 0 && height > 0
      ? {
          format: 'png',
          hasNonDefaultOrientation: false,
          height,
          width,
        }
      : null
  }

  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
    return null
  }

  let offset = 2
  let width = 0
  let height = 0
  let hasNonDefaultOrientation = false

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xFF) {
      return null
    }
    while (offset < bytes.length && bytes[offset] === 0xFF) {
      offset += 1
    }
    if (offset >= bytes.length) {
      return null
    }
    const marker = bytes[offset]
    offset += 1

    if (marker === 0xD9 || marker === 0xDA) {
      break
    }
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) {
      continue
    }
    if (marker === 0x00 || offset + 2 > bytes.length) {
      return null
    }

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1]
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null
    }

    const payloadStart = offset + 2
    if (marker === 0xE1 && hasExifNonDefaultOrientation(bytes.subarray(payloadStart, offset + segmentLength))) {
      hasNonDefaultOrientation = true
    }
    else if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
      height = (bytes[payloadStart + 1] << 8) | bytes[payloadStart + 2]
      width = (bytes[payloadStart + 3] << 8) | bytes[payloadStart + 4]
    }

    offset += segmentLength
  }

  return width > 0 && height > 0
    ? {
        format: 'jpeg',
        hasNonDefaultOrientation,
        height,
        width,
      }
    : null
}

function buildLanczos3Table(sourceLength: number, targetLength: number) {
  const scale = targetLength / sourceLength
  const filterScale = Math.min(1, scale)
  const radius = 3 / filterScale
  const maxTaps = Math.ceil(radius * 2) + 2
  const starts = new Int32Array(targetLength)
  const counts = new Int32Array(targetLength)
  const weights = new Float32Array(targetLength * maxTaps)

  for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
    const center = (targetIndex + 0.5) / scale - 0.5
    const left = Math.max(0, Math.floor(center - radius))
    const right = Math.min(sourceLength - 1, Math.ceil(center + radius))
    const count = right - left + 1
    starts[targetIndex] = left
    counts[targetIndex] = count

    const base = targetIndex * maxTaps
    let weightSum = 0
    for (let offset = 0; offset < count; offset += 1) {
      const x = (left + offset - center) * filterScale
      let weight = 0
      if (x === 0) {
        weight = 1
      }
      else if (Math.abs(x) < 3) {
        const piX = Math.PI * x
        const piXOver3 = piX / 3
        weight = (Math.sin(piX) / piX) * (Math.sin(piXOver3) / piXOver3)
      }
      weights[base + offset] = weight
      weightSum += weight
    }

    const inverseSum = weightSum > 0
      ? 1 / weightSum
      : 1
    for (let offset = 0; offset < count; offset += 1) {
      weights[base + offset] *= inverseSum
    }
  }

  return { counts, maxTaps, starts, weights }
}

export function resampleLanczos3(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    throw new Error('Image resample dimensions must be positive.')
  }
  if (source.length < sourceWidth * sourceHeight * 4) {
    throw new Error('Image pixel buffer is smaller than expected.')
  }

  const horizontal = buildLanczos3Table(sourceWidth, targetWidth)
  const vertical = buildLanczos3Table(sourceHeight, targetHeight)
  const intermediate = new Float32Array(targetWidth * sourceHeight * 3)

  for (let y = 0; y < sourceHeight; y += 1) {
    const sourceRowOffset = y * sourceWidth * 4
    const targetRowOffset = y * targetWidth * 3
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const start = horizontal.starts[targetX]
      const count = horizontal.counts[targetX]
      const weightBase = targetX * horizontal.maxTaps
      let red = 0
      let green = 0
      let blue = 0
      for (let tap = 0; tap < count; tap += 1) {
        const weight = horizontal.weights[weightBase + tap]
        const pixelOffset = sourceRowOffset + (start + tap) * 4
        red += source[pixelOffset] * weight
        green += source[pixelOffset + 1] * weight
        blue += source[pixelOffset + 2] * weight
      }
      const outOffset = targetRowOffset + targetX * 3
      intermediate[outOffset] = red
      intermediate[outOffset + 1] = green
      intermediate[outOffset + 2] = blue
    }
  }

  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  const intermediateRowStride = targetWidth * 3
  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const start = vertical.starts[targetY]
    const count = vertical.counts[targetY]
    const weightBase = targetY * vertical.maxTaps
    const outRowOffset = targetY * targetWidth * 4
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      let red = 0
      let green = 0
      let blue = 0
      const columnOffset = targetX * 3
      for (let tap = 0; tap < count; tap += 1) {
        const weight = vertical.weights[weightBase + tap]
        const pixelOffset = (start + tap) * intermediateRowStride + columnOffset
        red += intermediate[pixelOffset] * weight
        green += intermediate[pixelOffset + 1] * weight
        blue += intermediate[pixelOffset + 2] * weight
      }
      const outOffset = outRowOffset + targetX * 4
      output[outOffset] = clamp(Math.round(red), 0, 255)
      output[outOffset + 1] = clamp(Math.round(green), 0, 255)
      output[outOffset + 2] = clamp(Math.round(blue), 0, 255)
      output[outOffset + 3] = 255
    }
  }

  return output
}

function drawCroppedFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  fillColor: string,
  outputScale: number,
  drawScale: number,
  transform: CropTransform,
) {
  context.fillStyle = fillColor
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.save()
  context.scale(width / SOURCE_IMAGE_WIDTH, height / SOURCE_IMAGE_HEIGHT)
  context.translate(
    SOURCE_IMAGE_WIDTH / 2 + transform.crop.x * outputScale,
    SOURCE_IMAGE_HEIGHT / 2 + transform.crop.y * outputScale,
  )
  context.rotate(transform.rotation * Math.PI / 180)
  context.scale(drawScale, drawScale)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  context.restore()
}

function isImageFullyOpaque(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return false
  }
  context.drawImage(image, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  canvas.width = 0
  canvas.height = 0
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 255) {
      return false
    }
  }
  return true
}

async function resolveIdentityPassthroughFile(
  sourceFile: File | undefined,
  image: HTMLImageElement,
  transform: CropTransform,
  outputScale: number,
  drawScale: number,
) {
  if (
    !sourceFile
    || sourceFile.size <= 0
    || sourceFile.size > MAX_PASSTHROUGH_BYTES
    || image.naturalWidth !== SOURCE_IMAGE_WIDTH
    || image.naturalHeight !== SOURCE_IMAGE_HEIGHT
  ) {
    return null
  }

  const normalizedRotation = ((transform.rotation % 360) + 360) % 360
  if (
    Math.min(normalizedRotation, 360 - normalizedRotation) >= 0.01
    || Math.abs(drawScale - 1) >= 1e-3
    || Math.abs(transform.crop.x * outputScale) >= 0.5
    || Math.abs(transform.crop.y * outputScale) >= 0.5
  ) {
    return null
  }

  const bytes = new Uint8Array(await sourceFile.arrayBuffer())
  const header = readRawSourceImageHeader(bytes)
  if (!header || header.hasNonDefaultOrientation || header.width !== SOURCE_IMAGE_WIDTH || header.height !== SOURCE_IMAGE_HEIGHT) {
    return null
  }

  if (header.format === 'png' && !isImageFullyOpaque(image, SOURCE_IMAGE_WIDTH, SOURCE_IMAGE_HEIGHT)) {
    return null
  }

  const expectedMime = header.format === 'png'
    ? 'image/png'
    : 'image/jpeg'
  return sourceFile.type === expectedMime
    ? sourceFile
    : new File([sourceFile], sourceFile.name, {
        lastModified: sourceFile.lastModified,
        type: expectedMime,
      })
}

interface ExportCroppedImageOptions {
  cropSize: CropSize
  fileName: string
  fillColor?: string
  imageUrl: string
  mediaSize: CropMediaSize
  sourceFile?: File
  transform: CropTransform
}

export async function exportCroppedImage({
  cropSize,
  fileName,
  fillColor = DEFAULT_CROP_FILL_COLOR,
  imageUrl,
  mediaSize,
  sourceFile,
  transform,
}: ExportCroppedImageOptions) {
  const image = await loadImage(imageUrl)
  const outputScale = SOURCE_IMAGE_WIDTH / cropSize.width
  const mediaScale = mediaSize.width / image.naturalWidth
  const drawScale = mediaScale * transform.zoom * outputScale

  const passthrough = await resolveIdentityPassthroughFile(
    sourceFile,
    image,
    transform,
    outputScale,
    drawScale,
  )
  if (passthrough) {
    return passthrough
  }

  const canvas = document.createElement('canvas')
  canvas.width = SOURCE_IMAGE_WIDTH
  canvas.height = SOURCE_IMAGE_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Image processing is not available in this browser.')
  }

  const supersample = drawScale < 0.999
    ? Math.min(1 / drawScale, MAX_RESAMPLE_FACTOR)
    : 1
  const intermediateWidth = Math.max(SOURCE_IMAGE_WIDTH, Math.round(SOURCE_IMAGE_WIDTH * supersample))
  const intermediateHeight = Math.max(SOURCE_IMAGE_HEIGHT, Math.round(SOURCE_IMAGE_HEIGHT * supersample))

  if (intermediateWidth > SOURCE_IMAGE_WIDTH || intermediateHeight > SOURCE_IMAGE_HEIGHT) {
    const intermediateCanvas = document.createElement('canvas')
    intermediateCanvas.width = intermediateWidth
    intermediateCanvas.height = intermediateHeight
    const intermediateContext = intermediateCanvas.getContext('2d', { willReadFrequently: true })
    if (!intermediateContext) {
      throw new Error('Image processing is not available in this browser.')
    }

    drawCroppedFrame(
      intermediateContext,
      image,
      intermediateWidth,
      intermediateHeight,
      fillColor,
      outputScale,
      drawScale,
      transform,
    )
    const intermediatePixels = intermediateContext.getImageData(0, 0, intermediateWidth, intermediateHeight).data
    intermediateCanvas.width = 0
    intermediateCanvas.height = 0

    const resampled = resampleLanczos3(
      intermediatePixels,
      intermediateWidth,
      intermediateHeight,
      SOURCE_IMAGE_WIDTH,
      SOURCE_IMAGE_HEIGHT,
    )
    const outputImageData = context.createImageData(SOURCE_IMAGE_WIDTH, SOURCE_IMAGE_HEIGHT)
    outputImageData.data.set(resampled)
    context.putImageData(outputImageData, 0, 0)
  }
  else {
    drawCroppedFrame(
      context,
      image,
      SOURCE_IMAGE_WIDTH,
      SOURCE_IMAGE_HEIGHT,
      fillColor,
      outputScale,
      drawScale,
      transform,
    )
  }

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
