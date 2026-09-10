import { describe, expect, it } from 'vitest'
import {
  constrainCropSelectionChange,
  getMaximumCropSelectionWidth,
  isCropSelectionCovered,
  normalizeCropImageMatrix,
  resizeCropEditorState,
  SOURCE_IMAGE_ASPECT,
  toCropTransform,
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
    const selection = { height: 210, width: 512, x: 144, y: 95 }
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
    const matrix = normalizeCropImageMatrix({ ...image, matrix: [...image.matrix] }, selection)
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
    const current = { height: 164, width: 400, x: 200, y: 128 }
    const requested = { height: 410, width: 1000, x: -100, y: 5 }
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
    const selection = { height: 210, width: 512, x: 194, y: 135 }
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
