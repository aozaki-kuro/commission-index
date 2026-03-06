import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetModulesInTempDir, setupTempCommissionDb } from '../../../test/utils/tempCommissionDb'

describe('admin db home suggestion operations (sqlite integration)', () => {
  it('persists and orders featured keywords with dedupe', async () => {
    const { tempDir, dbPath } = setupTempCommissionDb('commission-index-admin-suggestion-db-')
    resetModulesInTempDir(tempDir)

    const adminDb = await import('./db')
    adminDb.saveHomeFeaturedSearchKeywords([
      'Kanaut Nishe',
      'maid',
      'kanaut nishe',
      'kimono',
      'night',
      'studio',
      'extra',
    ])

    expect(adminDb.getHomeFeaturedSearchKeywords()).toEqual([
      'Kanaut Nishe',
      'maid',
      'kimono',
      'night',
      'studio',
      'extra',
    ])

    const rawDb = new Database(dbPath, { readonly: true })
    const storedRows = rawDb
      .prepare(
        `
          SELECT keyword, sort_order as sortOrder
          FROM home_featured_search_keywords
          ORDER BY sort_order ASC
        `,
      )
      .all() as Array<{ keyword: string; sortOrder: number }>
    rawDb.close()

    expect(storedRows.map(row => row.keyword)).toEqual([
      'Kanaut Nishe',
      'maid',
      'kimono',
      'night',
      'studio',
      'extra',
    ])
    expect(storedRows.map(row => row.sortOrder)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('returns admin payload including options and featured keywords', async () => {
    const { tempDir } = setupTempCommissionDb('commission-index-admin-suggestion-data-')
    resetModulesInTempDir(tempDir)

    const adminDb = await import('./db')
    adminDb.saveHomeFeaturedSearchKeywords(['Kanaut Nishe', 'maid'])

    const payload = adminDb.getHomeSuggestionAdminData()

    expect(payload.featuredKeywords).toEqual(['Kanaut Nishe', 'maid'])
    expect(payload.keywordOptions.length).toBeGreaterThan(0)
    expect(payload.keywordOptions).not.toContain('2025/01')
  })
})
