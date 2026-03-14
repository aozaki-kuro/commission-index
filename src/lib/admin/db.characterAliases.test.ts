import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetModulesInTempDir, setupTempCommissionDb } from '../../../test/utils/tempCommissionDb'

describe('admin db character alias operations (sqlite integration)', () => {
  it('saves character aliases in batch and deduplicates base names', async () => {
    const { tempDir, dbPath } = setupTempCommissionDb('commission-index-admin-character-alias-db-')
    resetModulesInTempDir(tempDir)

    const adminDb = await import('./db')
    adminDb.saveCharacterAliasesBatch([
      { characterName: 'Kanaut Nishe', aliases: 'カナウト' },
      { characterName: ' kanaut   nishe ', aliases: ['かなうと', 'カナウト'] },
    ])

    const rows = adminDb.getCharacterAliasesAdminData()
    const kanautRow = rows.find(row => row.characterName.toLowerCase() === 'kanaut nishe')
    expect(kanautRow?.aliases).toEqual(expect.arrayContaining(['カナウト', 'かなうと']))

    const rawDb = new Database(dbPath, { readonly: true })
    const storedRows = rawDb
      .prepare(
        'SELECT character_name as characterName, aliases FROM character_aliases ORDER BY character_name ASC',
      )
      .all() as Array<{ characterName: string, aliases: string }>
    rawDb.close()

    const kanautRows = storedRows.filter(
      row => row.characterName.trim().toLowerCase() === 'kanaut nishe',
    )
    expect(kanautRows).toHaveLength(1)
  })
})
