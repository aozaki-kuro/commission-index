import { describe, expect, it } from 'vitest'
import { normalizeCharacterAliases, parseCharacterAliasesJson } from './characterAliases'
import { normalizeAliases, parseAliasesJson } from './creatorAliases'
import { normalizeKeywordAliases, parseKeywordAliasesJson } from './keywordAliases'

describe('alias normalization consistency', () => {
  describe('creator aliases (case-sensitive dedupe)', () => {
    it('preserves distinct case variants', () => {
      const result = normalizeAliases(['Nanashi', 'nanashi', 'NANASHI'])
      expect(result).toHaveLength(3)
      expect(result).toEqual(expect.arrayContaining(['Nanashi', 'nanashi', 'NANASHI']))
    })

    it('removes exact duplicates', () => {
      const result = normalizeAliases(['Nanashi', 'Nanashi', 'nanashi'])
      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(['Nanashi', 'nanashi']))
    })

    it('parses JSON and preserves case variants', () => {
      const result = parseAliasesJson('["Nanashi", "nanashi", "Nanashi"]')
      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(['Nanashi', 'nanashi']))
    })
  })

  describe('character aliases (case-insensitive dedupe)', () => {
    it('deduplicates case variants and keeps first spelling', () => {
      const result = normalizeCharacterAliases(['Saber', 'saber', 'SABER'])
      expect(result).toHaveLength(1)
      expect(result).toEqual(['Saber'])
    })

    it('normalizes whitespace before deduping', () => {
      const result = normalizeCharacterAliases(['Saber  Alter', 'saber alter', 'SABER ALTER'])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('Saber Alter')
    })

    it('parses JSON and applies case-insensitive dedupe', () => {
      const result = parseCharacterAliasesJson('["Saber", "saber", "Saber Alter", "saber alter"]')
      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(['Saber', 'Saber Alter']))
    })
  })

  describe('keyword aliases (case-insensitive dedupe)', () => {
    it('deduplicates case variants and keeps first spelling', () => {
      const result = normalizeKeywordAliases(['Full Body', 'full body', 'FULL BODY'])
      expect(result).toHaveLength(1)
      expect(result).toEqual(['Full Body'])
    })

    it('normalizes whitespace before deduping', () => {
      const result = normalizeKeywordAliases(['Full  Body', 'full body', 'FULL BODY'])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('Full Body')
    })

    it('parses JSON and applies case-insensitive dedupe', () => {
      const result = parseKeywordAliasesJson('["Full Body", "full body", "Chibi", "chibi"]')
      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(['Full Body', 'Chibi']))
    })
  })

  describe('cross-type comparison', () => {
    it('documents the deliberate policy difference', () => {
      const creatorResult = normalizeAliases(['Test', 'test'])
      const characterResult = normalizeCharacterAliases(['Test', 'test'])
      const keywordResult = normalizeKeywordAliases(['Test', 'test'])

      // Creator preserves case variants
      expect(creatorResult).toHaveLength(2)

      // Character and keyword collapse case variants
      expect(characterResult).toHaveLength(1)
      expect(keywordResult).toHaveLength(1)
    })
  })

  describe('edge cases that could expose bugs', () => {
    it('handles empty strings and whitespace-only entries', () => {
      expect(normalizeAliases(['', '  ', 'Valid'])).toEqual(['Valid'])
      expect(normalizeCharacterAliases(['', '  ', 'Valid'])).toEqual(['Valid'])
      expect(normalizeKeywordAliases(['', '  ', 'Valid'])).toEqual(['Valid'])
    })

    it('handles split patterns consistently', () => {
      const creatorInput = 'Nanashi,nanashi，NANASHI'
      const characterInput = 'Saber,saber，SABER'
      const keywordInput = 'Full Body,full body，FULL BODY'

      expect(normalizeAliases(creatorInput)).toHaveLength(3)
      expect(normalizeCharacterAliases(characterInput)).toHaveLength(1)
      expect(normalizeKeywordAliases(keywordInput)).toHaveLength(1)
    })

    it('handles mixed normalization and case in real-world batch merge', () => {
      // Simulates multiple DB rows being merged
      const batch1 = normalizeAliases(['Nanashi', '七市'])
      const batch2 = normalizeAliases(['nanashi', 'Nanashi (old)'])
      const merged = normalizeAliases([...batch1, ...batch2])

      // Should preserve all distinct spellings
      expect(merged).toHaveLength(4)
      expect(merged).toEqual(expect.arrayContaining(['Nanashi', 'nanashi', '七市', 'Nanashi (old)']))
    })

    it('demonstrates keyword alias map lookup behavior', () => {
      const aliases = normalizeKeywordAliases(['Full Body', 'full body', 'Fullbody'])

      // Map uses lowercase keys
      const map = new Map<string, string[]>()
      map.set('full body', aliases)

      // All case variants map to the same entry
      expect(map.get('full body')).toEqual(['Full Body', 'Fullbody'])
      expect(map.get('Full Body')).toBeUndefined() // Case-sensitive Map key
    })
  })
})
