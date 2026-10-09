import { describe, expect, it } from 'vitest'
import { buildCommissionSearchDomKey, buildCommissionSearchMetadata } from './commissionSearchMetadata'

describe('commissionSearchMetadata', () => {
  describe('buildCommissionSearchMetadata', () => {
    it('builds search text with character name, creator, date tokens, and keyword', () => {
      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: '2024-02-15',
        creatorName: 'Artist Name',
        fileName: '20240215_artist-name',
        keyword: 'blue, dragon',
      })

      expect(metadata.searchText).toContain('alpha')
      expect(metadata.searchText).toContain('artist name')
      expect(metadata.searchText).toContain('20240215')
      expect(metadata.searchText).toContain('date_y_2024')
      expect(metadata.searchText).toContain('date_ym_2024_02')
      expect(metadata.searchText).toContain('blue')
      expect(metadata.searchText).toContain('dragon')
      expect(metadata.searchSuggestionText).toContain('Date\t2024/02')
      expect(metadata.searchSuggestionText).toContain('Creator\tArtist Name')
    })

    it('includes design and description in search text', () => {
      const metadata = buildCommissionSearchMetadata({
        characterName: 'Beta',
        commissionDate: null,
        creatorName: null,
        fileName: 'opaque-key',
        design: 'casual outfit',
        description: 'winter scene',
      })

      expect(metadata.searchText).toContain('casual outfit')
      expect(metadata.searchText).toContain('winter scene')
    })

    it('expands character aliases into search text and suggestions', () => {
      const aliasesMap = new Map([['alpha', ['Alfa', 'Alpha Prime']]])

      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: null,
        creatorName: null,
        fileName: 'opaque-key',
        characterAliasesMap: aliasesMap,
      })

      expect(metadata.searchText).toContain('alfa')
      expect(metadata.searchText).toContain('alpha prime')
      expect(metadata.searchSuggestionText).toContain('Character\tAlfa')
      expect(metadata.searchSuggestionText).toContain('Character\tAlpha Prime')
    })

    it('expands creator aliases into search text and suggestions', () => {
      const aliasesMap = new Map([['Artist Name', ['ArtistAlias']]])

      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: null,
        creatorName: 'Artist Name',
        fileName: 'opaque-key',
        creatorAliasesMap: aliasesMap,
      })

      expect(metadata.searchText).toContain('artistalias')
      expect(metadata.searchSuggestionText).toContain('Creator\tArtist Name')
      expect(metadata.searchSuggestionText).toContain('Creator\tArtistAlias')
    })

    it('expands keyword aliases into search text', () => {
      const aliasesMap = new Map([['blue', ['azure', 'cyan']]])

      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: null,
        creatorName: null,
        fileName: 'opaque-key',
        keyword: 'blue',
        keywordAliasesMap: aliasesMap,
      })

      expect(metadata.searchText).toContain('azure')
      expect(metadata.searchText).toContain('cyan')
    })

    it('does not invent date or creator when missing', () => {
      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: null,
        creatorName: null,
        fileName: 'opaque-key',
      })

      expect(metadata.searchText).not.toContain('date_')
      expect(metadata.searchSuggestionText).not.toContain('Date\t')
      expect(metadata.searchSuggestionText).not.toContain('Creator\t')
    })

    it('includes legacy identity search term for old YYYYMMDD fileName', () => {
      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: '2024-01-01',
        creatorName: null,
        fileName: '19990315_legacy-file',
      })

      expect(metadata.searchText).toContain('19990315_legacy-file')
    })

    it('does not include legacy identity term for opaque fileName', () => {
      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: '2024-01-01',
        creatorName: null,
        fileName: 'opaque-key',
      })

      expect(metadata.searchText).not.toMatch(/opaque-key/)
    })

    it('deduplicates suggestions by normalized term', () => {
      const characterAliasesMap = new Map([['alpha', ['Alpha', 'alpha']]])

      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: null,
        creatorName: null,
        fileName: 'opaque-key',
        characterAliasesMap,
      })

      const lines = metadata.searchSuggestionText.split('\n').filter(line => line.includes('Character'))
      expect(lines).toHaveLength(1)
    })

    it('respects creatorSuggestionMode=raw', () => {
      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: null,
        creatorName: 'Artist Name (part 2)',
        fileName: 'opaque-key',
        creatorSuggestionMode: 'raw',
      })

      expect(metadata.searchSuggestionText).toContain('Creator\tArtist Name (part 2)')
      expect(metadata.searchSuggestionText).not.toContain('Creator\tArtist Name\n')
    })

    it('respects creatorSearchTextMode=both', () => {
      const metadata = buildCommissionSearchMetadata({
        characterName: 'Alpha',
        commissionDate: null,
        creatorName: 'Artist Name (part 2)',
        fileName: 'opaque-key',
        creatorSearchTextMode: 'both',
      })

      expect(metadata.searchText).toContain('artist name (part 2)')
      expect(metadata.searchText).toContain('artist name')
    })
  })

  describe('buildCommissionSearchDomKey', () => {
    it('combines section ID and fileName with :: delimiter', () => {
      expect(buildCommissionSearchDomKey('section-alpha', 'opaque-key')).toBe('section-alpha::opaque-key')
    })
  })
})
