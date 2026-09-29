import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('commissionRecords', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.doUnmock('./generatedFactSource')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reloads generated fact-source content across repeated development reads', async () => {
    const getGeneratedFactSourceContent = vi.fn(() => ({
      meta: {
        schemaVersion: 2,
        source: 'remote-admin-fact-source',
        exportedAt: '2026-03-18T00:00:00.000Z',
        revision: 'fixture',
        databaseBinding: 'DB',
        imagesBucket: 'commission-index-images',
      },
      characters: [
        {
          id: 1,
          name: 'Lucia',
          status: 'active',
          sortOrder: 1,
          commissions: [
            {
              id: 1,
              commissionDate: '2026-01-01',
              creatorName: 'creator',
              fileName: '20260101_creator_lucia',
              Links: [],
              Keyword: 'maid',
              Hidden: false,
            },
          ],
        },
      ],
      creatorAliases: [],
      characterAliases: [],
      keywordAliases: [],
      featuredSearchKeywords: [],
    }))

    vi.doMock('./generatedFactSource', () => ({
      getGeneratedFactSourceContent,
    }))

    const { getCharacterRecords } = await import('./commissionRecords')

    expect(getCharacterRecords()).toHaveLength(1)
    expect(getCharacterRecords()).toHaveLength(1)
    expect(getGeneratedFactSourceContent).toHaveBeenCalledTimes(3)
  })
})
