import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('creatorAliases data access', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('./generatedFactSource')
    vi.resetModules()
  })

  it('reads and merges normalized creator aliases from generated fact source', async () => {
    vi.doMock('./generatedFactSource', () => ({
      getGeneratedFactSourceContent: () => ({
        meta: {
          schemaVersion: 1,
          source: 'remote-admin-fact-source',
          exportedAt: '2026-03-18T00:00:00.000Z',
          revision: 'fixture',
          databaseBinding: 'DB',
          imagesBucket: 'commission-index-images',
        },
        characters: [],
        creatorAliases: [
          { creatorName: '七市', aliases: ['Nanashi'] },
          { creatorName: '七市 (part 1)', aliases: ['nanashi'] },
          { creatorName: 'Q (part 1)', aliases: ['Cue'] },
        ],
        characterAliases: [],
        keywordAliases: [],
        featuredSearchKeywords: [],
      }),
    }))

    const { getCreatorAliasesMap, normalizeCreatorSearchName } = await import('./creatorAliases')

    const aliasMap = getCreatorAliasesMap()

    expect(normalizeCreatorSearchName('Q (part 2)')).toBe('Q')
    expect(aliasMap.get('七市')).toEqual(expect.arrayContaining(['Nanashi', 'nanashi']))
    expect(aliasMap.get('Q')).toEqual(['Cue'])
  })
})
