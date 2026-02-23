import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { resetModulesInTempDir, setupTempCommissionDb } from '../../../test/utils/tempCommissionDb'

const loadAdminDbInTempDir = async () => {
  const { tempDir, dbPath } = setupTempCommissionDb('commission-index-admin-crud-')
  resetModulesInTempDir(tempDir)
  const adminDb = await import('./db')
  return { adminDb, dbPath }
}

describe('admin db commission and character operations (sqlite integration)', () => {
  it('creates, updates, and deletes commissions with normalized stored values', async () => {
    const { adminDb, dbPath } = await loadAdminDbInTempDir()
    const { characters } = adminDb.getAdminData()
    const targetCharacter = characters[0]

    expect(targetCharacter).toBeTruthy()

    const originalFileName = '20991231_Vitest Artist'
    const renamedFileName = '20991230_Vitest Artist'

    const created = adminDb.createCommission({
      characterId: targetCharacter!.id,
      fileName: `  ${originalFileName}  `,
      links: ['https://example.com/a', 'https://example.com/b'],
      design: 'design note',
      description: 'description note',
      keyword: 'foo, bar, foo\nbaz',
      hidden: true,
    })

    expect(created).toEqual({
      characterName: targetCharacter!.name,
      imageMapChanged: true,
    })

    const writableDb = new Database(dbPath)
    const inserted = writableDb
      .prepare(
        'SELECT id, file_name as fileName, links, design, description, keyword, hidden FROM commissions WHERE file_name = ?',
      )
      .get(originalFileName) as
      | {
          id: number
          fileName: string
          links: string
          design: string | null
          description: string | null
          keyword: string | null
          hidden: number
        }
      | undefined

    expect(inserted).toBeTruthy()
    expect(inserted?.fileName).toBe(originalFileName)
    expect(JSON.parse(inserted?.links ?? '[]')).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
    expect(inserted?.design).toBe('design note')
    expect(inserted?.description).toBe('description note')
    expect(inserted?.keyword).toBe('foo, bar, baz')
    expect(inserted?.hidden).toBe(1)

    const sameNameUpdate = adminDb.updateCommission({
      id: inserted!.id,
      characterId: targetCharacter!.id,
      fileName: originalFileName,
      links: ['https://example.com/updated'],
      design: null,
      description: null,
      keyword: 'alpha; alpha；beta',
      hidden: false,
    })

    expect(sameNameUpdate.imageMapChanged).toBe(false)

    const renamedUpdate = adminDb.updateCommission({
      id: inserted!.id,
      characterId: targetCharacter!.id,
      fileName: renamedFileName,
      links: ['https://example.com/updated'],
      design: undefined,
      description: undefined,
      keyword: 'alpha; alpha；beta',
      hidden: false,
    })

    expect(renamedUpdate.imageMapChanged).toBe(true)

    const updated = writableDb
      .prepare(
        'SELECT file_name as fileName, links, design, description, keyword, hidden FROM commissions WHERE id = ?',
      )
      .get(inserted!.id) as
      | {
          fileName: string
          links: string
          design: string | null
          description: string | null
          keyword: string | null
          hidden: number
        }
      | undefined

    expect(updated).toBeTruthy()
    expect(updated?.fileName).toBe(renamedFileName)
    expect(JSON.parse(updated?.links ?? '[]')).toEqual(['https://example.com/updated'])
    expect(updated?.design).toBeNull()
    expect(updated?.description).toBeNull()
    expect(updated?.keyword).toBe('alpha, beta')
    expect(updated?.hidden).toBe(0)

    expect(adminDb.deleteCommission(999999999)).toEqual({ imageMapChanged: false })
    expect(adminDb.deleteCommission(inserted!.id)).toEqual({ imageMapChanged: true })

    const deleted = writableDb
      .prepare('SELECT id FROM commissions WHERE id = ?')
      .get(inserted!.id) as { id: number } | undefined
    writableDb.close()

    expect(deleted).toBeUndefined()
  })

  it('updates character ordering and statuses across active/stale groups', async () => {
    const { adminDb } = await loadAdminDbInTempDir()
    const before = adminDb.getAdminData().characters

    const activeIds = before
      .filter(character => character.status === 'active')
      .map(character => character.id)
    const staleIds = before
      .filter(character => character.status === 'stale')
      .map(character => character.id)

    expect(activeIds.length).toBeGreaterThan(0)
    expect(staleIds.length).toBeGreaterThan(0)

    const nextActive = [...activeIds].reverse()
    const nextStale = [...staleIds].reverse()

    adminDb.updateCharactersOrder({ active: nextActive, stale: nextStale })

    const after = adminDb.getAdminData().characters
    expect(after.map(character => character.id)).toEqual([...nextActive, ...nextStale])

    const afterStatusById = new Map(
      after.map(character => [character.id, character.status] as const),
    )
    for (const id of nextActive) {
      expect(afterStatusById.get(id)).toBe('active')
    }
    for (const id of nextStale) {
      expect(afterStatusById.get(id)).toBe('stale')
    }
  })
})
