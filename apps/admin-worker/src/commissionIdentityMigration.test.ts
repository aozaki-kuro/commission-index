import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const migrationNames = [
  '0001_admin_fact_source.sql',
  '0002_source_image_metadata.sql',
  '0003_rename_stale_to_archived.sql',
  '0004_commission_identity.sql',
  '0005_public_commission_identity_and_parts.sql',
]

const partRecords = [
  ['20250930_Q (part 1)', 'Q (part 1)'],
  ['20250930_Q (part 2)', 'Q (part 2)'],
  ['20241230_Q (part 1)', 'Q (part 1)'],
  ['20241230_Q (part 2)', 'Q (part 2)'],
  ['20241027_Q (part 1)', 'Q (part 1)'],
  ['20241027_Q (part 2)', 'Q (part 2)'],
  ['20240819_Q (part 1)', 'Q (part 1)'],
  ['20240819_Q (part 2)', 'Q (part 2)'],
  ['20250302_Q (part 1)', 'Q (part 1)'],
  ['20250302_Q (part 2)', 'Q (part 2)'],
  ['20240421_Gisyu (part 1)', 'Gisyu (part 1)'],
  ['20240421_Gisyu (part 2)', 'Gisyu (part 2)'],
]

function createMigratedDatabase() {
  const database = new DatabaseSync(':memory:')
  const migrationsDirectory = path.resolve(import.meta.dirname, '../migrations')

  for (const migrationName of migrationNames.slice(0, 4)) {
    database.exec(readFileSync(path.join(migrationsDirectory, migrationName), 'utf8'))
  }

  database.exec('INSERT INTO characters(name, status, sort_order) VALUES (\'Fixture\', \'active\', 1)')
  const insert = database.prepare(`
    INSERT INTO commissions(character_id, file_name, links, commission_date, creator_name)
    VALUES (1, ?, '[]', '2024-01-01', ?)
  `)
  for (const [fileName, creatorName] of partRecords) {
    insert.run(fileName, creatorName)
  }
  insert.run('opaque-standalone', null)
  database.exec(readFileSync(path.join(migrationsDirectory, migrationNames[4]), 'utf8'))
  return database
}

describe('commission identity migration 0005', () => {
  it('backfills a unique opaque ID per row and keeps all twelve explicit parts in six groups', () => {
    const database = createMigratedDatabase()
    try {
      const counts = database.prepare(`
        SELECT
          count(*) AS commissions,
          count(DISTINCT public_id) AS unique_public_ids,
          count(*) FILTER (WHERE public_id IS NULL) AS missing_public_ids,
          count(*) FILTER (WHERE part_number IS NOT NULL) AS part_count
        FROM commissions
      `).get()
      const groups = database.prepare(`
        SELECT work_group_id, count(*) AS member_count,
          min(part_number) AS first_part, max(part_number) AS last_part
        FROM commissions
        WHERE work_group_id IS NOT NULL
        GROUP BY work_group_id
      `).all()
      const invalidIds = database.prepare(`
        SELECT count(*) AS count FROM commissions
        WHERE public_id NOT GLOB '????????-????-4???-[89ab]???-????????????'
      `).get()

      expect(counts).toEqual({
        commissions: 13,
        unique_public_ids: 13,
        missing_public_ids: 0,
        part_count: 12,
      })
      expect(groups).toHaveLength(6)
      expect(groups.every(group => group.member_count === 2 && group.first_part === 1 && group.last_part === 2)).toBe(true)
      expect(invalidIds).toEqual({ count: 0 })
      expect(database.prepare('SELECT creator_name FROM commissions WHERE file_name = \'20240421_Gisyu (part 1)\'').get())
        .toEqual({ creator_name: 'Gisyu' })
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    }
    finally {
      database.close()
    }
  })

  it('assigns opaque IDs to old-worker inserts and rejects broken or duplicate part mappings', () => {
    const database = createMigratedDatabase()
    try {
      database.exec('INSERT INTO commissions(character_id, file_name, links) VALUES (1, \'legacy-writer\', \'[]\')')
      const created = database.prepare('SELECT public_id FROM commissions WHERE file_name = \'legacy-writer\'').get() as { public_id: string }
      expect(created.public_id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)

      expect(() => database.exec('INSERT INTO commissions(character_id, public_id, file_name, links, work_group_id) VALUES (1, \'invalid\', \'invalid-id\', \'[]\', \'a1d30840-d212-4f3b-a814-7cab2f443ac1\')'))
        .toThrow()
      expect(() => database.exec('UPDATE commissions SET public_id = \'b1d30840-d212-4f3b-a814-7cab2f443ac1\' WHERE file_name = \'legacy-writer\''))
        .toThrow()
      expect(() => database.exec('UPDATE commissions SET work_group_id = \'a1d30840-d212-4f3b-a814-7cab2f443ac1\' WHERE file_name = \'legacy-writer\''))
        .toThrow()
      expect(() => database.exec('DELETE FROM commission_groups WHERE id = \'a1d30840-d212-4f3b-a814-7cab2f443ac1\''))
        .toThrow()
    }
    finally {
      database.close()
    }
  })
})
