import { describe, expect, it } from 'vitest'
import {
  captureCropEditorState,
  constrainCropSelectionChange,
  getCropOverflowAxis,
  getEdgeMedianColor,
  getMaximumCropSelectionWidth,
  isCropSelectionCovered,
  normalizeCropImageMatrix,
  refitCropSelectionAfterRotation,
  resizeCropEditorState,
  restoreCropEditorState,
  SOURCE_IMAGE_ASPECT,
  toCropTransform,
  zoomImageToFitOverflowFrame,
} from './imageCrop'

function createRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('image crop geometry', () => {
  it('normalizes a Cropper.js matrix against the real rotated image polygon', () => {
    const selection = {
      height: 210,
      width: 512,
      x: 144,
      y: 95,
    }
    const angle = 37 * Math.PI / 180
    const image = {
      baseCenter: { x: 400, y: 200 },
      matrix: [
        Math.cos(angle) * 0.3,
        Math.sin(angle) * 0.3,
        -Math.sin(angle) * 0.3,
        Math.cos(angle) * 0.3,
        900,
        -600,
      ] as const,
      size: { height: 900, width: 1600 },
    }
    const matrix = normalizeCropImageMatrix({
      ...image,
      matrix: [...image.matrix],
    }, selection)
    const normalized = { ...image, matrix }

    expect(isCropSelectionCovered(selection, normalized)).toBe(true)
    expect(normalizeCropImageMatrix(normalized, selection)).toEqual(matrix)
  })

  it('finds the maximum fixed-ratio selection at arbitrary rotations', () => {
    const random = createRandom(0xBADC0DE)

    for (let index = 0; index < 2000; index += 1) {
      const canvasSize = { height: 480, width: 900 }
      const center = {
        x: 180 + random() * 540,
        y: 120 + random() * 240,
      }
      const angle = (-180 + random() * 360) * Math.PI / 180
      const scale = 0.4 + random() * 1.8
      const image = {
        baseCenter: { x: 450, y: 240 },
        matrix: [
          Math.cos(angle) * scale,
          Math.sin(angle) * scale,
          -Math.sin(angle) * scale,
          Math.cos(angle) * scale,
          (random() - 0.5) * 80,
          (random() - 0.5) * 80,
        ] as [number, number, number, number, number, number],
        size: { height: 900, width: 1600 },
      }
      const width = getMaximumCropSelectionWidth({
        aspectRatio: SOURCE_IMAGE_ASPECT,
        canvasSize,
        center,
        image,
      })
      const selection = {
        height: width / SOURCE_IMAGE_ASPECT,
        width,
        x: center.x - width / 2,
        y: center.y - width / SOURCE_IMAGE_ASPECT / 2,
      }

      if (width > 0) {
        expect(isCropSelectionCovered(selection, image, canvasSize)).toBe(true)
      }
    }
  })

  it('stops a handle at the nearest valid selection along its drag path', () => {
    const canvasSize = { height: 420, width: 800 }
    const angle = 11 * Math.PI / 180
    const image = {
      baseCenter: { x: 400, y: 210 },
      matrix: [
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        0,
        0,
      ] as [number, number, number, number, number, number],
      size: { height: 560, width: 900 },
    }
    const current = {
      height: 164,
      width: 400,
      x: 200,
      y: 128,
    }
    const requested = {
      height: 410,
      width: 1000,
      x: -100,
      y: 5,
    }
    const constrained = constrainCropSelectionChange({
      canvasSize,
      current,
      image,
      minimumWidth: 96,
      requested,
    })

    expectSelectionCovered(constrained, image, canvasSize)
    expect(constrained.width).toBeGreaterThan(current.width)
    expect(constrained.width).toBeLessThan(requested.width)
  })

  it('converts the image matrix and independent frame center for JPEG export', () => {
    const angle = -28 * Math.PI / 180
    const image = {
      baseCenter: { x: 400, y: 240 },
      matrix: [
        Math.cos(angle) * 1.4,
        Math.sin(angle) * 1.4,
        -Math.sin(angle) * 1.4,
        Math.cos(angle) * 1.4,
        23,
        -17,
      ] as [number, number, number, number, number, number],
      size: { height: 600, width: 1000 },
    }
    const transform = toCropTransform(image, {
      height: 210,
      width: 512,
      x: 118,
      y: 72,
    })

    expect(transform.crop).toEqual({ x: 49, y: 46 })
    expect(transform.rotation).toBeCloseTo(-28, 10)
    expect(transform.zoom).toBeCloseTo(1.4, 10)
  })

  it('preserves the crop content when the responsive workspace resizes', () => {
    const currentCanvasSize = { height: 480, width: 900 }
    const nextCanvasSize = { height: 300, width: 390 }
    const selection = {
      height: 210,
      width: 512,
      x: 194,
      y: 135,
    }
    const angle = 37 * Math.PI / 180
    const sourceImage = {
      baseCenter: { x: 800, y: 450 },
      matrix: [
        Math.cos(angle) * 0.6,
        Math.sin(angle) * 0.6,
        -Math.sin(angle) * 0.6,
        Math.cos(angle) * 0.6,
        -360,
        -220,
      ] as [number, number, number, number, number, number],
      size: { height: 900, width: 1600 },
    }
    const image = {
      ...sourceImage,
      matrix: normalizeCropImageMatrix(sourceImage, selection),
    }
    const currentTransform = toCropTransform(image, selection)
    const resized = resizeCropEditorState({
      currentCanvasSize,
      image,
      nextCanvasSize,
      selection,
    })
    const nextTransform = toCropTransform(resized.image, resized.selection)

    expectSelectionCovered(resized.selection, resized.image, nextCanvasSize)
    expect(nextTransform.rotation).toBeCloseTo(currentTransform.rotation, 10)
    expect(nextTransform.zoom / resized.selection.width)
      .toBeCloseTo(currentTransform.zoom / selection.width, 10)
    expect(nextTransform.crop.x / resized.selection.width)
      .toBeCloseTo(currentTransform.crop.x / selection.width, 10)
    expect(nextTransform.crop.y / resized.selection.height)
      .toBeCloseTo(currentTransform.crop.y / selection.height, 10)
  })
  it('restores a confirmed crop in a new session with a different layout origin and canvas', () => {
    const selection = {
      height: 210,
      width: 512,
      x: 194,
      y: 135,
    }
    const angle = 37 * Math.PI / 180
    const sourceImage = {
      baseCenter: { x: 800, y: 450 },
      matrix: [
        Math.cos(angle) * 0.6,
        Math.sin(angle) * 0.6,
        -Math.sin(angle) * 0.6,
        Math.cos(angle) * 0.6,
        -360,
        -220,
      ] as [number, number, number, number, number, number],
      size: { height: 900, width: 1600 },
    }
    const image = {
      ...sourceImage,
      matrix: normalizeCropImageMatrix(sourceImage, selection),
    }
    const canvasSize = { height: 480, width: 900 }
    const state = captureCropEditorState({
      allowOverflow: false,
      canvasSize,
      fillColor: '#ffffff',
      image,
      preferredWidth: 600,
      selection,
    })
    const confirmed = toCropTransform(image, selection)
    // The next session's element sits at a different offset before any transform is applied.
    const nextImage = {
      ...sourceImage,
      baseCenter: { x: 812, y: 401 },
      matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
    }

    const same = restoreCropEditorState(state, nextImage, canvasSize)
    const sameTransform = toCropTransform(same.image, same.selection)
    expect(same.selection).toEqual(selection)
    expect(sameTransform.crop.x).toBeCloseTo(confirmed.crop.x, 10)
    expect(sameTransform.crop.y).toBeCloseTo(confirmed.crop.y, 10)
    expect(sameTransform.zoom).toBeCloseTo(confirmed.zoom, 10)
    expect(same.preferredWidth).toBe(600)

    const nextCanvasSize = { height: 300, width: 390 }
    const resized = restoreCropEditorState(state, nextImage, nextCanvasSize)
    const transform = toCropTransform(resized.image, resized.selection)
    expectSelectionCovered(resized.selection, resized.image, nextCanvasSize)
    expect(transform.rotation).toBeCloseTo(confirmed.rotation, 10)
    expect(transform.zoom / resized.selection.width).toBeCloseTo(confirmed.zoom / selection.width, 10)
    expect(transform.crop.x / resized.selection.width).toBeCloseTo(confirmed.crop.x / selection.width, 10)
    expect(resized.preferredWidth).toBeCloseTo(600 * resized.scale, 10)
  })

  it('keeps the frame centre after a rotation and never grows a frame already below the minimum', () => {
    const canvasSize = { height: 400, width: 800 }
    const angle = 30 * Math.PI / 180
    const image = {
      baseCenter: { x: 400, y: 200 },
      matrix: [
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        0,
        0,
      ] as [number, number, number, number, number, number],
      size: { height: 300, width: 600 },
    }
    const selection = {
      height: 400 / SOURCE_IMAGE_ASPECT,
      width: 400,
      x: 200,
      y: 200 - 200 / SOURCE_IMAGE_ASPECT,
    }
    const options = {
      allowOverflow: false,
      canvasSize,
      image,
      minimumWidth: 96,
      selection,
    }
    const maximumWidth = getMaximumCropSelectionWidth({
      aspectRatio: SOURCE_IMAGE_ASPECT,
      canvasSize,
      center: { x: 400, y: 200 },
      image,
    })

    const shrunk = refitCropSelectionAfterRotation({ ...options, preferredWidth: Number.POSITIVE_INFINITY })
    expect(maximumWidth).toBeLessThan(selection.width)
    expect(shrunk.width).toBeCloseTo(maximumWidth, 10)
    expect(shrunk.width / shrunk.height).toBeCloseTo(SOURCE_IMAGE_ASPECT, 10)
    expect(shrunk.x + shrunk.width / 2).toBeCloseTo(400, 10)
    expect(shrunk.y + shrunk.height / 2).toBeCloseTo(200, 10)
    expectSelectionCovered(shrunk, image, canvasSize)

    expect(refitCropSelectionAfterRotation({ ...options, preferredWidth: 120 }).width).toBe(120)

    const tiny = {
      height: 40 / SOURCE_IMAGE_ASPECT,
      width: 40,
      x: 380,
      y: 200 - 20 / SOURCE_IMAGE_ASPECT,
    }
    expect(refitCropSelectionAfterRotation({ ...options, preferredWidth: 10, selection: tiny }).width).toBe(40)
  })

  describe('overflow mode', () => {
    // A 4093×2894 artwork shown at 0.2 scale, centred in a wide canvas.
    const canvasSize = { height: 700, width: 1800 }
    const size = { height: 2894, width: 4093 }
    const rotated = (degrees: number, scale = 0.2, offset = { x: 0, y: 0 }) => {
      const angle = degrees * Math.PI / 180
      return {
        baseCenter: { x: 900, y: 350 },
        matrix: [
          Math.cos(angle) * scale,
          Math.sin(angle) * scale,
          -Math.sin(angle) * scale,
          Math.cos(angle) * scale,
          offset.x,
          offset.y,
        ] as [number, number, number, number, number, number],
        size,
      }
    }

    it('relaxes the image axis that lets the frame grow at the current rotation', () => {
      expect(getCropOverflowAxis(size, 0)).toBe('x')
      expect(getCropOverflowAxis(size, Math.PI / 2)).toBe('y')
      expect(getCropOverflowAxis({ height: 500, width: 4000 }, 0)).toBe('y')
    })

    it('lets the frame take the full image height at 0°, padding the sides', () => {
      const image = rotated(0)
      const center = { x: 900, y: 350 }
      const contained = getMaximumCropSelectionWidth({
        aspectRatio: SOURCE_IMAGE_ASPECT,
        canvasSize,
        center,
        image,
      })
      const width = getMaximumCropSelectionWidth({
        allowOverflow: true,
        aspectRatio: SOURCE_IMAGE_ASPECT,
        canvasSize,
        center,
        image,
      })
      // Each side keeps the 2px-of-1280 output bleed.
      const bleedRate = 2 / 1280

      expect(contained).toBeCloseTo(4093 * 0.2 / (1 + 2 * bleedRate), 6)
      expect(width / SOURCE_IMAGE_ASPECT).toBeCloseTo(2894 * 0.2 / (1 + 2 * bleedRate * SOURCE_IMAGE_ASPECT), 6)
      expect(width).toBeGreaterThan(4093 * 0.2)
      const selection = {
        height: width / SOURCE_IMAGE_ASPECT,
        width,
        x: center.x - width / 2,
        y: center.y - width / SOURCE_IMAGE_ASPECT / 2,
      }
      expect(isCropSelectionCovered(selection, image, canvasSize, true)).toBe(true)
      expect(isCropSelectionCovered(selection, image, canvasSize)).toBe(false)
    })

    it('keeps the kept axis exactly covered at arbitrary rotations while the relaxed axis may overflow', () => {
      const random = createRandom(0xC0FFEE)
      let overflowed = 0

      for (let index = 0; index < 2000; index += 1) {
        const degrees = -180 + random() * 360
        const image = rotated(degrees, 0.08 + random() * 0.25, { x: (random() - 0.5) * 200, y: (random() - 0.5) * 120 })
        const center = { x: 300 + random() * 1200, y: 150 + random() * 400 }
        const width = getMaximumCropSelectionWidth({
          allowOverflow: true,
          aspectRatio: SOURCE_IMAGE_ASPECT,
          canvasSize,
          center,
          image,
        })
        if (width <= 0)
          continue
        const selection = {
          height: width / SOURCE_IMAGE_ASPECT,
          width,
          x: center.x - width / 2,
          y: center.y - width / SOURCE_IMAGE_ASPECT / 2,
        }
        expect(isCropSelectionCovered(selection, image, canvasSize, true)).toBe(true)

        const angle = degrees * Math.PI / 180
        const scale = Math.hypot(image.matrix[0], image.matrix[1])
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sx, sy]) => {
          const dx = center.x + sx * width / 2 - (image.baseCenter.x + image.matrix[4])
          const dy = center.y + sy * selection.height / 2 - (image.baseCenter.y + image.matrix[5])
          return { x: cos * dx + sin * dy, y: -sin * dx + cos * dy }
        })
        const keptX = getCropOverflowAxis(size, angle) === 'y'
        for (const corner of corners) {
          if (keptX)
            expect(Math.abs(corner.x)).toBeLessThanOrEqual(size.width * scale / 2 + 1e-6)
          else
            expect(Math.abs(corner.y)).toBeLessThanOrEqual(size.height * scale / 2 + 1e-6)
        }
        if (!isCropSelectionCovered(selection, image, canvasSize))
          overflowed += 1
      }

      expect(overflowed).toBeGreaterThan(0)
    })

    it('zooms the image out on Fit until the full-height overflow frame fits the canvas', () => {
      const image = rotated(0, 0.4)
      const center = { x: 900, y: 350 }
      const matrix = zoomImageToFitOverflowFrame({
        aspectRatio: SOURCE_IMAGE_ASPECT,
        canvasSize,
        center,
        image,
      })
      const zoomed = { ...image, matrix }
      const width = getMaximumCropSelectionWidth({
        allowOverflow: true,
        aspectRatio: SOURCE_IMAGE_ASPECT,
        canvasSize,
        center,
        image: zoomed,
      })
      const scale = Math.hypot(matrix[0], matrix[1])

      expect(scale).toBeLessThan(0.4)
      expect(width).toBeCloseTo(Math.min(canvasSize.width, canvasSize.height * SOURCE_IMAGE_ASPECT), 6)
      expect(width / SOURCE_IMAGE_ASPECT).toBeCloseTo(2894 * scale / (1 + 2 * 2 / 1280 * SOURCE_IMAGE_ASPECT), 6)
      expect(zoomImageToFitOverflowFrame({
        aspectRatio: SOURCE_IMAGE_ASPECT,
        canvasSize,
        center,
        image: rotated(0, 0.1),
      }))
        .toEqual(rotated(0, 0.1).matrix)
    })

    it('fills with the per-channel median of the strips bordering the overflow area', () => {
      const width = 100
      const height = 40
      const data = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          // Blue body, a two-column green edge on each side, and one red outlier row (a signature) in the edge.
          const color = y === 5
            ? [255, 0, 0]
            : x < 2 || x >= width - 2
              ? [10, 200, 30]
              : [0, 0, 255]
          data.set([...color, 255], (y * width + x) * 4)
        }
      }

      expect(getEdgeMedianColor(data, width, height, 'x')).toBe('#0ac81e')
      // The top/bottom strips are the blue body.
      expect(getEdgeMedianColor(data, width, height, 'y')).toBe('#0000ff')
    })

    it('stops the frame centre from leaving the image on the relaxed axis', () => {
      const image = rotated(0)
      const height = 2894 * 0.2 * 0.5
      const width = height * SOURCE_IMAGE_ASPECT
      const atEdge = {
        height,
        width,
        x: 900 + 4093 * 0.1 - width / 2,
        y: 350 - height / 2,
      }
      const beyond = { ...atEdge, x: atEdge.x + 5 }

      expect(isCropSelectionCovered(atEdge, image, undefined, true)).toBe(true)
      expect(isCropSelectionCovered(beyond, image, undefined, true)).toBe(false)
      const matrix = normalizeCropImageMatrix(image, beyond, true)
      expect(isCropSelectionCovered(beyond, { ...image, matrix }, undefined, true)).toBe(true)
      expect(matrix[0]).toBeCloseTo(0.2, 10)
    })

    it('round-trips an overflowing frame through capture and restore', () => {
      const image = rotated(0)
      const width = 1300
      const selection = {
        height: width / SOURCE_IMAGE_ASPECT,
        width,
        x: 250,
        y: 350 - width / SOURCE_IMAGE_ASPECT / 2,
      }
      const normalized = {
        ...image,
        matrix: normalizeCropImageMatrix(image, selection, true),
      }
      const confirmed = toCropTransform(normalized, selection)
      const state = captureCropEditorState({
        allowOverflow: true,
        canvasSize,
        fillColor: '#123456',
        image: normalized,
        preferredWidth: width,
        selection,
      })
      const restored = restoreCropEditorState(state, {
        ...image,
        matrix: [1, 0, 0, 1, 0, 0],
      }, canvasSize)
      const transform = toCropTransform(restored.image, restored.selection)

      expect(restored.selection).toEqual(selection)
      expect(state.fillColor).toBe('#123456')
      expect(transform.zoom).toBeCloseTo(confirmed.zoom, 10)
      expect(transform.crop.x).toBeCloseTo(confirmed.crop.x, 10)
      expect(isCropSelectionCovered(restored.selection, restored.image, canvasSize)).toBe(false)
    })
  })
})

function expectSelectionCovered(
  selection: { height: number, width: number, x: number, y: number },
  image: {
    baseCenter: { x: number, y: number }
    matrix: [number, number, number, number, number, number]
    size: { height: number, width: number }
  },
  canvasSize: { height: number, width: number },
) {
  expect(isCropSelectionCovered(selection, image, canvasSize)).toBe(true)
}
