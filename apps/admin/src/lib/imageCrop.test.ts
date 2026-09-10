import { describe, expect, it } from 'vitest'
import {
  getMinimumCropZoom,
  normalizeCropTransform,
} from './imageCrop'

const EPSILON = 1e-7

function createRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function expectCropCornersInsideImage({
  crop,
  cropSize,
  mediaSize,
  rotation,
  zoom,
}: {
  crop: { x: number, y: number }
  cropSize: { width: number, height: number }
  mediaSize: { width: number, height: number }
  rotation: number
  zoom: number
}) {
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  for (const x of [-cropSize.width / 2, cropSize.width / 2]) {
    for (const y of [-cropSize.height / 2, cropSize.height / 2]) {
      const localX = cos * (x - crop.x) + sin * (y - crop.y)
      const localY = -sin * (x - crop.x) + cos * (y - crop.y)
      expect(Math.abs(localX)).toBeLessThanOrEqual(mediaSize.width * zoom / 2 + EPSILON)
      expect(Math.abs(localY)).toBeLessThanOrEqual(mediaSize.height * zoom / 2 + EPSILON)
    }
  }
}

describe('image crop geometry', () => {
  it('keeps every crop corner inside the image for arbitrary transforms', () => {
    const random = createRandom(0xC0FFEE)

    for (let index = 0; index < 10_000; index += 1) {
      const mediaSize = {
        height: 120 + random() * 1400,
        width: 120 + random() * 2200,
      }
      const cropSize = {
        height: 60 + random() * 440,
        width: 140 + random() * 900,
      }
      const rotation = -720 + random() * 1440
      const minimumZoom = getMinimumCropZoom(mediaSize, cropSize, rotation)
      const normalized = normalizeCropTransform({
        crop: {
          x: (random() - 0.5) * 8000,
          y: (random() - 0.5) * 8000,
        },
        rotation,
        zoom: minimumZoom * (0.1 + random() * 5),
      }, mediaSize, cropSize)

      expect(normalized.zoom).toBeGreaterThanOrEqual(minimumZoom - EPSILON)
      expectCropCornersInsideImage({
        ...normalized,
        cropSize,
        mediaSize,
      })
    }
  })

  it('is idempotent and preserves already valid positions', () => {
    const mediaSize = { height: 620, width: 980 }
    const cropSize = { height: 210, width: 512 }
    const transform = {
      crop: { x: 18, y: -12 },
      rotation: 37,
      zoom: 2.4,
    }

    const normalized = normalizeCropTransform(transform, mediaSize, cropSize)
    const normalizedAgain = normalizeCropTransform(normalized, mediaSize, cropSize)

    expect(normalized.zoom).toBe(transform.zoom)
    expect(normalized.rotation).toBe(transform.rotation)
    expect(normalized.crop.x).toBeCloseTo(transform.crop.x, 12)
    expect(normalized.crop.y).toBeCloseTo(transform.crop.y, 12)
    expect(normalizedAgain.zoom).toBe(normalized.zoom)
    expect(normalizedAgain.crop.x).toBeCloseTo(normalized.crop.x, 12)
    expect(normalizedAgain.crop.y).toBeCloseTo(normalized.crop.y, 12)
  })

  it('has the same constraints after a full rotation', () => {
    const mediaSize = { height: 560, width: 920 }
    const cropSize = { height: 180, width: 438 }
    const crop = { x: 900, y: -600 }

    const first = normalizeCropTransform({ crop, rotation: 23, zoom: 2 }, mediaSize, cropSize)
    const fullTurn = normalizeCropTransform({ crop, rotation: 383, zoom: 2 }, mediaSize, cropSize)

    expect(fullTurn.zoom).toBeCloseTo(first.zoom, 10)
    expect(fullTurn.crop.x).toBeCloseTo(first.crop.x, 10)
    expect(fullTurn.crop.y).toBeCloseTo(first.crop.y, 10)
  })
})
