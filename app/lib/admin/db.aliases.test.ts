import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetModulesInTempDir, setupTempCommissionDb } from '../../../test/utils/tempCommissionDb'

describe('admin db creator alias operations (sqlite integration)', () => {
  it('saves aliases in batch and normalizes creator names', async () => {
    const { tempDir, dbPath } = setupTempCommissionDb('commission-index-admin-db-')
    resetModulesInTempDir(tempDir)

    const adminDb = await import('./db')
    adminDb.saveCreatorAliasesBatch([
      { creatorName: '統合テスト名', aliases: 'TestAlias' },
      { creatorName: 'Q (part 1)', aliases: ['Cue'] },
      { creatorName: 'Q (part 2)', aliases: ['cue'] },
    ])

    const rows = adminDb.getCreatorAliasesAdminData()
    const qRow = rows.find(row => row.creatorName === 'Q')
    const testRow = rows.find(row => row.creatorName === '統合テスト名')

    expect(qRow?.aliases).toEqual(expect.arrayContaining(['Cue', 'cue']))
    expect(testRow?.aliases).toEqual(['TestAlias'])
    expect(testRow?.commissionCount).toBe(0)

    const rawDb = new Database(dbPath, { readonly: true })
    const storedRows = rawDb
      .prepare(
        'SELECT creator_name as creatorName, aliases FROM creator_aliases WHERE creator_name IN (?, ?) ORDER BY creator_name',
      )
      .all('Q', '統合テスト名') as Array<{ creatorName: string; aliases: string }>
    rawDb.close()

    expect(storedRows.map(row => row.creatorName)).toEqual(
      expect.arrayContaining(['Q', '統合テスト名']),
    )
  })
})
