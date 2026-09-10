import type {
  CropperCanvas,
  CropperImage,
  CropperSelection,
} from 'cropperjs'
import type { PointerEvent as ReactPointerEvent, Ref } from 'react'
import type {
  CropImageGeometry,
  CropMatrix,
  CropMediaSize,
  CropPoint,
  CropSelection,
  CropTransform,
} from '../../lib/imageCrop'
import Cropper from 'cropperjs'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  constrainCropSelectionChange,
  getMaximumCropSelectionWidth,
  normalizeCropImageMatrix,
  resizeCropEditorState,
  SOURCE_IMAGE_ASPECT,
  toCropTransform,
} from '../../lib/imageCrop'

const MINIMUM_CROP_WIDTH = 96
const ROTATION_EPSILON = 0.000_01
const TEMPLATE = `
  <cropper-canvas>
    <cropper-image rotatable scalable translatable initial-fit="contain"></cropper-image>
    <cropper-shade></cropper-shade>
    <cropper-handle action="move" plain></cropper-handle>
    <cropper-selection resizable precise outlined>
      <cropper-grid role="grid" covered></cropper-grid>
      <cropper-handle action="move" plain></cropper-handle>
      <cropper-handle action="n-resize"></cropper-handle>
      <cropper-handle action="e-resize"></cropper-handle>
      <cropper-handle action="s-resize"></cropper-handle>
      <cropper-handle action="w-resize"></cropper-handle>
      <cropper-handle action="ne-resize"></cropper-handle>
      <cropper-handle action="nw-resize"></cropper-handle>
      <cropper-handle action="se-resize"></cropper-handle>
      <cropper-handle action="sw-resize"></cropper-handle>
    </cropper-selection>
  </cropper-canvas>
`

export interface ImageCropSnapshot {
  cropSize: CropSelection
  mediaSize: CropMediaSize
  rotation: number
  transform: CropTransform
}

export interface ImageCropWorkspaceHandle {
  fitCrop: () => void
  reset: () => void
  rotateBy: (degrees: number) => void
}

interface ImageCropWorkspaceProps {
  imageUrl: string
  onChange: (snapshot: ImageCropSnapshot) => void
  onError: (message: string) => void
  ref?: Ref<ImageCropWorkspaceHandle>
}

interface CropperElements {
  canvas: CropperCanvas
  image: CropperImage
  selection: CropperSelection
}

interface WorkspaceView {
  rotation: number
  selection: CropSelection
}

function toMatrix(matrix: number[]): CropMatrix {
  return [
    matrix[0] ?? 1,
    matrix[1] ?? 0,
    matrix[2] ?? 0,
    matrix[3] ?? 1,
    matrix[4] ?? 0,
    matrix[5] ?? 0,
  ]
}

function getSelection(selection: CropperSelection): CropSelection {
  return {
    height: selection.height,
    width: selection.width,
    x: selection.x,
    y: selection.y,
  }
}

function getImageGeometry(image: CropperImage): CropImageGeometry {
  return {
    baseCenter: {
      x: image.offsetLeft + image.offsetWidth / 2,
      y: image.offsetTop + image.offsetHeight / 2,
    },
    matrix: toMatrix(image.$getTransform()),
    size: {
      height: image.offsetHeight,
      width: image.offsetWidth,
    },
  }
}

function getCanvasSize(canvas: CropperCanvas) {
  return {
    height: canvas.clientHeight,
    width: canvas.clientWidth,
  }
}

function getRotation(matrix: CropMatrix) {
  return Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI
}

function getAngleDelta(current: number, previous: number) {
  let delta = current - previous
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

function rotateMatrixAround(
  geometry: CropImageGeometry,
  center: { x: number, y: number },
  degrees: number,
): CropMatrix {
  const radians = degrees * Math.PI / 180
  const currentRotation = Math.atan2(geometry.matrix[1], geometry.matrix[0])
  const scale = Math.hypot(geometry.matrix[0], geometry.matrix[1])
  const imageCenter = {
    x: geometry.baseCenter.x + geometry.matrix[4],
    y: geometry.baseCenter.y + geometry.matrix[5],
  }
  const relativeX = imageCenter.x - center.x
  const relativeY = imageCenter.y - center.y
  const cosDelta = Math.cos(radians)
  const sinDelta = Math.sin(radians)
  const nextCenter = {
    x: center.x + cosDelta * relativeX - sinDelta * relativeY,
    y: center.y + sinDelta * relativeX + cosDelta * relativeY,
  }
  const rotation = currentRotation + radians
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  return [
    cos * scale,
    sin * scale,
    -sin * scale,
    cos * scale,
    nextCenter.x - geometry.baseCenter.x,
    nextCenter.y - geometry.baseCenter.y,
  ]
}

export function ImageCropWorkspace({ imageUrl, onChange, onError, ref }: ImageCropWorkspaceProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorHostRef = useRef<HTMLDivElement>(null)
  const elementsRef = useRef<CropperElements | null>(null)
  const initializedSizeRef = useRef({ height: 0, width: 0 })
  const applyingRef = useRef(false)
  const preferredWidthRef = useRef(Number.POSITIVE_INFINITY)
  const onChangeRef = useRef(onChange)
  const onErrorRef = useRef(onError)
  const rotateGestureRef = useRef<{
    angle: number
    center: CropPoint
    pointerId: number
  } | null>(null)
  const [view, setView] = useState<WorkspaceView | null>(null)

  onChangeRef.current = onChange
  onErrorRef.current = onError

  const emitSnapshot = useCallback(() => {
    const elements = elementsRef.current
    if (!elements)
      return

    const selection = getSelection(elements.selection)
    const geometry = getImageGeometry(elements.image)
    const rotation = getRotation(geometry.matrix)
    const nativeImage = elements.image.$image

    setView({ rotation, selection })
    onChangeRef.current({
      cropSize: selection,
      mediaSize: {
        height: geometry.size.height,
        naturalHeight: nativeImage.naturalHeight,
        naturalWidth: nativeImage.naturalWidth,
        width: geometry.size.width,
      },
      rotation,
      transform: toCropTransform(geometry, selection),
    })
  }, [])

  const applyEditorState = useCallback((
    selection: CropSelection,
    matrix: CropMatrix,
  ) => {
    const elements = elementsRef.current
    if (!elements)
      return

    applyingRef.current = true
    elements.selection.$change(
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      SOURCE_IMAGE_ASPECT,
    )
    elements.image.$setTransform(matrix)
    applyingRef.current = false
    emitSnapshot()
  }, [emitSnapshot])

  const fitCrop = useCallback((preferredWidth = preferredWidthRef.current) => {
    const elements = elementsRef.current
    if (!elements)
      return

    const selection = getSelection(elements.selection)
    const center = {
      x: selection.x + selection.width / 2,
      y: selection.y + selection.height / 2,
    }
    const geometry = getImageGeometry(elements.image)
    const maximumWidth = getMaximumCropSelectionWidth({
      aspectRatio: SOURCE_IMAGE_ASPECT,
      canvasSize: getCanvasSize(elements.canvas),
      center,
      image: geometry,
    })
    const width = Math.min(preferredWidth, maximumWidth)
    const nextSelection = width >= MINIMUM_CROP_WIDTH
      ? {
          height: width / SOURCE_IMAGE_ASPECT,
          width,
          x: center.x - width / 2,
          y: center.y - width / SOURCE_IMAGE_ASPECT / 2,
        }
      : selection
    const matrix = normalizeCropImageMatrix(geometry, nextSelection)

    applyEditorState(nextSelection, matrix)
  }, [applyEditorState])

  const rotateBy = useCallback((degrees: number) => {
    const elements = elementsRef.current
    if (!elements || !Number.isFinite(degrees) || degrees === 0)
      return

    const selection = getSelection(elements.selection)
    const center = {
      x: selection.x + selection.width / 2,
      y: selection.y + selection.height / 2,
    }
    const currentGeometry = getImageGeometry(elements.image)
    const rotatedMatrix = rotateMatrixAround(currentGeometry, center, degrees)
    const rotatedGeometry = { ...currentGeometry, matrix: rotatedMatrix }
    const maximumWidth = getMaximumCropSelectionWidth({
      aspectRatio: SOURCE_IMAGE_ASPECT,
      canvasSize: getCanvasSize(elements.canvas),
      center,
      image: rotatedGeometry,
    })
    const width = Math.max(
      Math.min(preferredWidthRef.current, maximumWidth),
      Math.min(MINIMUM_CROP_WIDTH, selection.width),
    )
    const nextSelection = {
      height: width / SOURCE_IMAGE_ASPECT,
      width,
      x: center.x - width / 2,
      y: center.y - width / SOURCE_IMAGE_ASPECT / 2,
    }
    const matrix = normalizeCropImageMatrix(rotatedGeometry, nextSelection)

    applyEditorState(nextSelection, matrix)
  }, [applyEditorState])

  const initializeEditor = useCallback(() => {
    const elements = elementsRef.current
    if (!elements || elements.canvas.clientWidth <= 0 || elements.canvas.clientHeight <= 0)
      return

    applyingRef.current = true
    elements.image.$resetTransform().$center('contain')
    applyingRef.current = false
    const canvasSize = getCanvasSize(elements.canvas)
    const width = Math.min(canvasSize.width * 0.86, canvasSize.height * 0.66 * SOURCE_IMAGE_ASPECT)
    const selection = {
      height: width / SOURCE_IMAGE_ASPECT,
      width,
      x: (canvasSize.width - width) / 2,
      y: (canvasSize.height - width / SOURCE_IMAGE_ASPECT) / 2,
    }
    const matrix = normalizeCropImageMatrix(getImageGeometry(elements.image), selection)

    preferredWidthRef.current = Number.POSITIVE_INFINITY
    initializedSizeRef.current = canvasSize
    applyEditorState(selection, matrix)
  }, [applyEditorState])

  const syncEditorSize = useCallback(() => {
    const elements = elementsRef.current
    if (!elements)
      return

    const nextSize = getCanvasSize(elements.canvas)
    const currentSize = initializedSizeRef.current
    if (nextSize.width <= 0 || nextSize.height <= 0)
      return
    if (currentSize.width <= 0 || currentSize.height <= 0) {
      initializeEditor()
      return
    }
    if (
      Math.abs(nextSize.width - currentSize.width) < 1
      && Math.abs(nextSize.height - currentSize.height) < 1
    ) {
      return
    }

    const resized = resizeCropEditorState({
      currentCanvasSize: currentSize,
      image: getImageGeometry(elements.image),
      nextCanvasSize: nextSize,
      selection: getSelection(elements.selection),
    })

    if (Number.isFinite(preferredWidthRef.current))
      preferredWidthRef.current *= resized.scale
    initializedSizeRef.current = nextSize
    applyEditorState(resized.selection, resized.image.matrix)
  }, [applyEditorState, initializeEditor])

  useImperativeHandle(ref, () => ({
    fitCrop: () => {
      preferredWidthRef.current = Number.POSITIVE_INFINITY
      fitCrop()
    },
    reset: initializeEditor,
    rotateBy,
  }), [fitCrop, initializeEditor, rotateBy])

  useEffect(() => {
    const host = hostRef.current
    const editorHost = editorHostRef.current
    if (!host || !editorHost)
      return

    const source = new Image()
    source.alt = 'Image being cropped'
    source.src = imageUrl
    editorHost.appendChild(source)

    const cropper = new Cropper(source, { container: editorHost, template: TEMPLATE })
    const canvas = cropper.getCropperCanvas()
    const image = cropper.getCropperImage()
    const selection = cropper.getCropperSelection()

    if (!canvas || !image || !selection) {
      cropper.destroy()
      source.remove()
      onErrorRef.current('The image editor could not be initialized.')
      return
    }

    canvas.scaleStep = 0.04
    selection.aspectRatio = SOURCE_IMAGE_ASPECT
    selection.resizable = true
    selection.precise = true
    selection.outlined = true
    elementsRef.current = { canvas, image, selection }

    const shade = canvas.querySelector('cropper-shade')
    shade?.setAttribute('theme-color', 'var(--crop-shade)')
    selection.setAttribute('theme-color', 'var(--crop-frame)')
    canvas.querySelectorAll('cropper-handle').forEach((handle) => {
      handle.setAttribute('theme-color', 'var(--crop-frame)')
    })

    const handleSelectionChange = (event: Event) => {
      if (applyingRef.current)
        return

      const customEvent = event as CustomEvent<CropSelection>
      const current = getSelection(selection)
      const requested = customEvent.detail
      customEvent.preventDefault()
      const constrained = constrainCropSelectionChange({
        canvasSize: getCanvasSize(canvas),
        current,
        image: getImageGeometry(image),
        minimumWidth: Math.min(MINIMUM_CROP_WIDTH, current.width),
        requested,
      })

      preferredWidthRef.current = constrained.width
      applyEditorState(constrained, normalizeCropImageMatrix(getImageGeometry(image), constrained))
    }

    const handleImageTransform = (event: Event) => {
      if (applyingRef.current)
        return

      const customEvent = event as CustomEvent<{ matrix: number[], oldMatrix: number[] }>
      customEvent.preventDefault()
      const currentSelection = getSelection(selection)
      const currentGeometry = getImageGeometry(image)
      const requestedGeometry = { ...currentGeometry, matrix: toMatrix(customEvent.detail.matrix) }
      const oldRotation = getRotation(toMatrix(customEvent.detail.oldMatrix))
      const nextRotation = getRotation(requestedGeometry.matrix)
      const rotationChanged = Math.abs(nextRotation - oldRotation) > ROTATION_EPSILON

      if (rotationChanged) {
        const center = {
          x: currentSelection.x + currentSelection.width / 2,
          y: currentSelection.y + currentSelection.height / 2,
        }
        const maximumWidth = getMaximumCropSelectionWidth({
          aspectRatio: SOURCE_IMAGE_ASPECT,
          canvasSize: getCanvasSize(canvas),
          center,
          image: requestedGeometry,
        })
        const width = Math.max(
          Math.min(preferredWidthRef.current, maximumWidth),
          Math.min(MINIMUM_CROP_WIDTH, currentSelection.width),
        )
        const nextSelection = {
          height: width / SOURCE_IMAGE_ASPECT,
          width,
          x: center.x - width / 2,
          y: center.y - width / SOURCE_IMAGE_ASPECT / 2,
        }

        applyEditorState(
          nextSelection,
          normalizeCropImageMatrix(requestedGeometry, nextSelection),
        )
        return
      }

      applyEditorState(
        currentSelection,
        normalizeCropImageMatrix(requestedGeometry, currentSelection),
      )
    }

    selection.addEventListener('change', handleSelectionChange)
    image.addEventListener('transform', handleImageTransform)

    let resizeFrame = 0
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(syncEditorSize)
    })
    resizeObserver.observe(host)

    image.$ready()
      .then(() => window.requestAnimationFrame(syncEditorSize))
      .catch(() => onErrorRef.current('The selected image could not be decoded.'))

    return () => {
      window.cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
      selection.removeEventListener('change', handleSelectionChange)
      image.removeEventListener('transform', handleImageTransform)
      elementsRef.current = null
      cropper.destroy()
      source.remove()
    }
  }, [applyEditorState, imageUrl, syncEditorSize])

  const handleRotatePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!view)
      return
    const host = hostRef.current
    if (!host)
      return

    const rect = host.getBoundingClientRect()
    const centerX = rect.left + view.selection.x + view.selection.width / 2
    const centerY = rect.top + view.selection.y + view.selection.height / 2
    rotateGestureRef.current = {
      angle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      center: { x: centerX, y: centerY },
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handleRotatePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = rotateGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId)
      return

    const angle = Math.atan2(
      event.clientY - gesture.center.y,
      event.clientX - gesture.center.x,
    )
    const delta = getAngleDelta(angle, gesture.angle)
    gesture.angle = angle
    rotateBy(delta * 180 / Math.PI)
  }

  const stopRotateGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (rotateGestureRef.current?.pointerId === event.pointerId) {
      rotateGestureRef.current = null
    }
  }

  return (
    <div
      ref={hostRef}
      className="crop-workspace absolute inset-4 overflow-hidden sm:inset-6"
      data-testid="cropper"
      aria-label="Crop image workspace"
    >
      <div ref={editorHostRef} className="absolute inset-0" />
      {view
        ? (
            <button
              type="button"
              aria-label="Rotate image freely"
              title="Drag to rotate"
              className="crop-rotation-handle"
              style={{
                left: view.selection.x + view.selection.width / 2,
                top: view.selection.y - 50,
              }}
              onPointerDown={handleRotatePointerDown}
              onPointerMove={handleRotatePointerMove}
              onPointerUp={stopRotateGesture}
              onPointerCancel={stopRotateGesture}
            >
              <span aria-hidden="true" />
            </button>
          )
        : null}
    </div>
  )
}
