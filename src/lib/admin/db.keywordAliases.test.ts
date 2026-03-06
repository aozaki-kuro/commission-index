import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetModulesInTempDir, setupTempCommissionDb } from '../../../test/utils/tempCommissionDb'

describe('admin db keyword alias operations (sqlite integration)', () => {
  it('saves keyword aliases in batch and deduplicates base keywords', async () => {
    const { tempDir, dbPath } = setupTempCommissionDb('commission-index-admin-keyword-alias-db-')
    resetModulesInTempDir(tempDir)

    const adminDb = await import('./db')
    adminDb.saveKeywordAliasesBatch([
      { baseKeyword: 'Kanaut Nishe', aliases: 'カナウト' },
      { baseKeyword: 'kanaut   nishe', aliases: ['かなうと', 'カナウト'] },
      { baseKeyword: 'maid', aliases: ['メイド'] },
    ])

    const rows = adminDb.getKeywordAliasesAdminData()
    const kanautRow = rows.find(row => row.baseKeyword.toLowerCase() === 'kanaut nishe')
    const maidRow = rows.find(row => row.baseKeyword === 'maid')

    expect(kanautRow?.aliases).toEqual(expect.arrayContaining(['カナウト', 'かなうと']))
    expect(maidRow?.aliases).toEqual(['メイド'])

    const rawDb = new Database(dbPath, { readonly: true })
    const storedRows = rawDb
      .prepare(
        'SELECT base_keyword as baseKeyword, aliases FROM keyword_aliases ORDER BY base_keyword ASC',
      )
      .all() as Array<{ baseKeyword: string; aliases: string }>
    rawDb.close()

    const kanautRows = storedRows.filter(
      row => row.baseKeyword.trim().toLowerCase() === 'kanaut nishe',
    )
    const maidRows = storedRows.filter(row => row.baseKeyword.trim().toLowerCase() === 'maid')

    expect(kanautRows).toHaveLength(1)
    expect(maidRows).toHaveLength(1)
  })
})
