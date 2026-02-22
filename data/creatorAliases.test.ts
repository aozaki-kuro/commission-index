import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetModulesInTempDir, setupTempCommissionDb } from '../test/utils/tempCommissionDb'

describe('creatorAliases data access (sqlite integration)', () => {
  it('reads and merges normalized creator aliases from sqlite', async () => {
    const { tempDir, dbPath } = setupTempCommissionDb('commission-index-aliases-')
    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE IF NOT EXISTS creator_aliases (
        creator_name TEXT PRIMARY KEY,
        aliases TEXT NOT NULL
      );
      DELETE FROM creator_aliases;
    `)
    db.prepare('INSERT INTO creator_aliases (creator_name, aliases) VALUES (?, ?)').run(
      '七市',
      JSON.stringify(['Nanashi']),
    )
    db.prepare('INSERT INTO creator_aliases (creator_name, aliases) VALUES (?, ?)').run(
      '七市 (part 1)',
      JSON.stringify(['nanashi']),
    )
    db.prepare('INSERT INTO creator_aliases (creator_name, aliases) VALUES (?, ?)').run(
      'Q (part 1)',
      JSON.stringify(['Cue']),
    )
    db.close()

    resetModulesInTempDir(tempDir)
    const { getCreatorAliasesMap, normalizeCreatorSearchName } = await import('./creatorAliases')

    const aliasMap = getCreatorAliasesMap()

    expect(normalizeCreatorSearchName('Q (part 2)')).toBe('Q')
    expect(aliasMap.get('七市')).toEqual(expect.arrayContaining(['Nanashi', 'nanashi']))
    expect(aliasMap.get('Q')).toEqual(['Cue'])
  })
})
