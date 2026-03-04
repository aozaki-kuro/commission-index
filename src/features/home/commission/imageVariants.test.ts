import { describe, expect, it } from 'vitest'
import { buildResponsiveSrcSet } from './imageVariants'

describe('buildResponsiveSrcSet', () => {
  it('builds 960w and 1280w variants', () => {
    expect(buildResponsiveSrcSet('/images/sample.webp')).toBe(
      '/images/sample-960.webp 960w, /images/sample-1280.webp 1280w',
    )
  })

  it('preserves query strings', () => {
    expect(buildResponsiveSrcSet('/images/sample.webp?v=1')).toBe(
      '/images/sample-960.webp?v=1 960w, /images/sample-1280.webp?v=1 1280w',
    )
  })

  it('returns empty string when extension is missing', () => {
    expect(buildResponsiveSrcSet('/images/sample')).toBe('')
  })
})
