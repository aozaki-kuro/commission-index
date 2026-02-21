import { describe, expect, it } from 'vitest'
import {
  buildCharacterNavItems,
  getCharacterSectionHash,
  getCharacterSectionId,
  getCharacterSlug,
  getCharacterTitleHash,
  getCharacterTitleId,
} from './nav'

describe('characters utils', () => {
  it('creates stable slug/id/hash values', () => {
    expect(getCharacterSlug('Alpha Beta')).toBe('alpha-beta')
    expect(getCharacterSectionId('Alpha Beta')).toBe('alpha-beta')
    expect(getCharacterTitleId('Alpha Beta')).toBe('title-alpha-beta')
    expect(getCharacterSectionHash('Alpha Beta')).toBe('#alpha-beta')
    expect(getCharacterTitleHash('Alpha Beta')).toBe('#title-alpha-beta')
  })

  it('builds navigation items from character display names', () => {
    expect(
      buildCharacterNavItems([{ DisplayName: 'Foo Bar' }, { DisplayName: 'Nero Claudius' }]),
    ).toEqual([
      {
        displayName: 'Foo Bar',
        sectionId: 'foo-bar',
        titleId: 'title-foo-bar',
        sectionHash: '#foo-bar',
        titleHash: '#title-foo-bar',
      },
      {
        displayName: 'Nero Claudius',
        sectionId: 'nero-claudius',
        titleId: 'title-nero-claudius',
        sectionHash: '#nero-claudius',
        titleHash: '#title-nero-claudius',
      },
    ])
  })
})
