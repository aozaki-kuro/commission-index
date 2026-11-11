import { describe, expect, it } from 'vitest'
import {
  buildCharacterNavItems,
  buildCharacterSectionIds,
  getCharacterSectionHash,
  getCharacterSectionId,
  getCharacterSlug,
  getCharacterTitleHash,
  getCharacterTitleId,
  getCommissionEntryAnchorId,
} from './nav'

describe('characters utils', () => {
  it('creates stable slug/id/hash values', () => {
    expect(getCharacterSlug('Alpha Beta')).toBe('alpha-beta')
    expect(getCharacterSectionId('Alpha Beta')).toBe('alpha-beta')
    expect(getCharacterTitleId('Alpha Beta')).toBe('title-alpha-beta')
    expect(getCharacterSectionHash('Alpha Beta')).toBe('#alpha-beta')
    expect(getCharacterTitleHash('Alpha Beta')).toBe('#title-alpha-beta')
  })

  it('gives every character a non-empty unique section id and keeps ASCII slugs', () => {
    const ids = buildCharacterSectionIds([
      { id: 5, name: 'Foo Bar', sortOrder: 1 },
      { id: 6, name: '雪ノ下', sortOrder: 2 },
      { id: 7, name: 'foo-bar', sortOrder: 3 },
      { id: 8, name: 'FOO  BAR!', sortOrder: 4 },
      { id: 9, name: 'Character 6', sortOrder: 5 },
      { id: 10, name: 'Nero Claudius', sortOrder: 6 },
    ])

    expect(ids.get('Foo Bar')).toBe('foo-bar')
    expect(ids.get('Nero Claudius')).toBe('nero-claudius')
    expect(ids.get('雪ノ下')).toBe('character-6-2')
    expect(ids.get('foo-bar')).toBe('character-7')
    expect(ids.get('FOO  BAR!')).toBe('character-8')
    // An ASCII name whose slug looks like a fallback keeps it; the fallback moves instead.
    expect(ids.get('Character 6')).toBe('character-6')
    expect(new Set(ids.values()).size).toBe(ids.size)
  })

  it('orders collisions by sortOrder, not input order', () => {
    const ids = buildCharacterSectionIds([
      { id: 2, name: 'foo-bar', sortOrder: 9 },
      { id: 1, name: 'Foo Bar', sortOrder: 1 },
    ])

    expect(ids.get('Foo Bar')).toBe('foo-bar')
    expect(ids.get('foo-bar')).toBe('character-2')
  })

  it('never yields an empty id for a name outside the fact source', () => {
    expect(getCharacterSectionId('雪ノ下 雪乃')).toBe('character-雪ノ下-雪乃')
    expect(getCharacterSectionHash('雪ノ下 雪乃')).toBe('#character-雪ノ下-雪乃')
    expect(getCharacterTitleId('雪ノ下 雪乃')).toBe('title-character-雪ノ下-雪乃')
    expect(getCommissionEntryAnchorId('Alpha Beta', 'p1')).toBe('alpha-beta-commission-p1')
  })

  it('builds navigation items from character display names', () => {
    expect(
      buildCharacterNavItems([
        { DisplayName: 'Foo Bar' },
        { DisplayName: 'Nero Claudius' },
      ]),
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
