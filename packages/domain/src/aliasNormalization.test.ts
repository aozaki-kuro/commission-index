import { describe, expect, it } from 'vitest'
import { normalizeCharacterAliases, parseCharacterAliasesJson } from './characterAliases'
import { normalizeAliases, parseAliasesJson } from './creatorAliases'
import { normalizeKeywordAliases, parseKeywordAliasesJson } from './keywordAliases'

describe('alias normalization consistency', () => {
  it.each([
    {
      name: 'creator preserves distinct case variants',
      run: () => normalizeAliases(['Nanashi', 'nanashi', 'NANASHI']),
      expected: ['Nanashi', 'nanashi', 'NANASHI'],
    },
    {
      name: 'creator removes exact duplicates',
      run: () => normalizeAliases(['Nanashi', 'Nanashi', 'nanashi']),
      expected: ['Nanashi', 'nanashi'],
    },
    {
      name: 'creator parses JSON and preserves case variants',
      run: () => parseAliasesJson('["Nanashi", "nanashi", "Nanashi"]'),
      expected: ['Nanashi', 'nanashi'],
    },
    {
      name: 'character deduplicates case variants and keeps first spelling',
      run: () => normalizeCharacterAliases(['Saber', 'saber', 'SABER']),
      expected: ['Saber'],
    },
    {
      name: 'character normalizes whitespace before deduping',
      run: () => normalizeCharacterAliases(['Saber  Alter', 'saber alter', 'SABER ALTER']),
      expected: ['Saber Alter'],
    },
    {
      name: 'character parses JSON and applies case-insensitive dedupe',
      run: () => parseCharacterAliasesJson('["Saber", "saber", "Saber Alter", "saber alter"]'),
      expected: ['Saber', 'Saber Alter'],
    },
    {
      name: 'keyword deduplicates case variants and keeps first spelling',
      run: () => normalizeKeywordAliases(['Full Body', 'full body', 'FULL BODY']),
      expected: ['Full Body'],
    },
    {
      name: 'keyword normalizes whitespace before deduping',
      run: () => normalizeKeywordAliases(['Full  Body', 'full body', 'FULL BODY']),
      expected: ['Full Body'],
    },
    {
      name: 'keyword parses JSON and applies case-insensitive dedupe',
      run: () => parseKeywordAliasesJson('["Full Body", "full body", "Chibi", "chibi"]'),
      expected: ['Full Body', 'Chibi'],
    },
  ])('$name', ({ run, expected }) => {
    expect(run()).toEqual(expected)
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
  })
})
