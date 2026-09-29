import type { SourceImageRecord } from './sourceImageRegistry'
import { describe, expect, it } from 'vitest'
import {
  buildSourceImageLookup,
  listMissingSourceImages,
  normalizeSourceImageStem,
  resolveSourceImageByCommissionFileName,
  resolveSourceImageStem,

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
  it('normalizes stems consistently', () => {
    expect(normalizeSourceImageStem('20240421_Gisyu (part 1)')).toBe('20240421gisyupart1')
    expect(normalizeSourceImageStem('20240421_Gisyu-part-1')).toBe('20240421gisyupart1')
  })

  it('resolves exact and fallback stems', () => {
    const records: SourceImageRecord[] = [
      { commissionId: 1, stem: '20240421_Gisyu (part 1)', metadata: createMetadata('a') },
      { commissionId: 2, stem: '20260208_Dorei', metadata: createMetadata('b') },
      { commissionId: 3, stem: '20260226_七市', metadata: createMetadata('c') },
    ]
    const lookup = buildSourceImageLookup(records)

    expect(resolveSourceImageStem('20260208_Dorei', lookup)).toBe('20260208_Dorei')
    expect(resolveSourceImageStem('20240421_Gisyu part 1', lookup)).toBe('20240421_Gisyu (part 1)')
    expect(resolveSourceImageStem('20260226_ナナシ', lookup)).toBe('20260226_七市')

    const resolved = resolveSourceImageByCommissionFileName('20240421_Gisyu part 1', lookup)
    expect(resolved?.src).toBe('/mock/a.jpg')
    expect(lookup.byCommissionId.get(2)?.src).toBe('/mock/b.jpg')
  })

  it('reports missing source images from commission file names', () => {
    const lookup = buildSourceImageLookup([
      { commissionId: 1, stem: '20260208_Dorei', metadata: createMetadata('a') },
      { commissionId: 2, stem: '20260226_七市', metadata: createMetadata('b') },
    ])

    const missing = listMissingSourceImages(
      ['20260208_Dorei', '20260221_七市', '20260226_七市', '20260221_七市'],
      lookup,
    )

    expect(missing).toEqual(['20260221_七市'])
  })

  it('rejects duplicate or invalid commission identities in image records', () => {
    expect(() => buildSourceImageLookup([
      { commissionId: 1, stem: 'first', metadata: createMetadata('a') },
      { commissionId: 1, stem: 'second', metadata: createMetadata('b') },
    ])).toThrow(/commission ID/)
    expect(() => buildSourceImageLookup([
      { commissionId: 0, stem: 'invalid', metadata: createMetadata('a') },
    ])).toThrow(/commission ID/)
  })
})
