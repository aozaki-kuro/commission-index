import type { SourceImageRecord } from './sourceImageRegistry'
import { describe, expect, it } from 'vitest'
import {
  buildSourceImageLookup,
  listMissingSourceImages,
  requireSourceImageMetadata,
  resolveSourceImageByCommissionId,
} from './sourceImageRegistry'

function createMetadata(label: string): ImageMetadata {
  return {
    src: `/mock/${label}.jpg`,
    width: 1000,
    height: 500,
    format: 'jpg',
  }
}

describe('sourceImageRegistry', () => {
  it('resolves an exact commission ID to its own image', () => {
    const records: SourceImageRecord[] = [
      { commissionId: 1, metadata: createMetadata('a') },
      { commissionId: 2, metadata: createMetadata('b') },
    ]
    const lookup = buildSourceImageLookup(records)

    expect(resolveSourceImageByCommissionId(2, lookup)?.src).toBe('/mock/b.jpg')
    expect(resolveSourceImageByCommissionId(1, lookup)?.src).toBe('/mock/a.jpg')
  })

  it('keeps commissions that share a date prefix on their own images', () => {
    const lookup = buildSourceImageLookup([
      { commissionId: 2, metadata: createMetadata('nanashi-city') },
      { commissionId: 3, metadata: createMetadata('nanashi') },
    ])

    expect(resolveSourceImageByCommissionId(2, lookup)?.src).toBe('/mock/nanashi-city.jpg')
    expect(resolveSourceImageByCommissionId(3, lookup)?.src).toBe('/mock/nanashi.jpg')
  })

  it('reports a commission without its own image as missing instead of a neighbour', () => {
    // Same date and similar creator name as commission 2, but a different commission.
    const lookup = buildSourceImageLookup([
      { commissionId: 1, metadata: createMetadata('a') },
    ])

    expect(resolveSourceImageByCommissionId(2, lookup)).toBeNull()
    expect(listMissingSourceImages([
      { id: 1, fileName: '20260226_七市' },
      { id: 2, fileName: '20260226_ナナシ' },
    ], lookup)).toEqual(['20260226_ナナシ'])
  })

  it('rejects duplicate or invalid commission IDs in image records', () => {
    expect(() => buildSourceImageLookup([
      { commissionId: 1, metadata: createMetadata('a') },
      { commissionId: 1, metadata: createMetadata('b') },
    ])).toThrow(/commission ID/)
    expect(() => buildSourceImageLookup([
      { commissionId: 0, metadata: createMetadata('a') },
    ])).toThrow(/commission ID/)
  })

  it('throws for a visible entry whose module is absent or has no default export', () => {
    expect(() => requireSourceImageMetadata('/generated/source-images/a.jpg', undefined)).toThrow(/missing/)
    expect(() => requireSourceImageMetadata('/generated/source-images/a.jpg', { default: undefined } as never)).toThrow(/missing/)
    expect(requireSourceImageMetadata('/x.jpg', { default: createMetadata('a') }).src).toBe('/mock/a.jpg')
  })
})
