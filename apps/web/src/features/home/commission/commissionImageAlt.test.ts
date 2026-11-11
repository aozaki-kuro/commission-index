import { describe, expect, it } from 'vitest'
import { buildCommissionImageAlt } from './commissionImageAlt'

describe('buildCommissionImageAlt', () => {
  it('describes the image with the character, creator, date and part shown beside it', () => {
    expect(buildCommissionImageAlt({
      characterName: '枫霜 Kaede',
      creatorLabel: 'Artist',
      dateLabel: '2024/03/01',
      partLabel: 'Part 2',
    })).toBe('枫霜 Kaede, Artist, 2024/03/01, Part 2')
  })

  it('skips missing pieces and never carries the copyright notice', () => {
    const alt = buildCommissionImageAlt({
      characterName: 'Kaede',
      creatorLabel: 'Anon',
      dateLabel: '',
      partLabel: null,
    })

    expect(alt).toBe('Kaede, Anon')
    expect(alt).not.toContain('©')
  })
})
