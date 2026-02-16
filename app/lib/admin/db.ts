import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export type CharacterStatus = 'active' | 'stale'

interface CharacterRow {
  id: number
  name: string
  status: CharacterStatus
  sortOrder: number
  commissionCount: number
}

interface CommissionRow {
  id: number
  characterId: number
  characterName: string
  fileName: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden: boolean
}

export interface AdminData {
  characters: CharacterRow[]
  commissions: CommissionRow[]
}

type BetterSqlite3Database = Database.Database

const isDevelopment = process.env.NODE_ENV !== 'production'
const databasePath = path.join(process.cwd(), 'data', 'commissions.db')

const ensureDatabaseExists = () => {
  if (!fs.existsSync(databasePath)) {
    throw new Error(
      `SQLite database not found at ${databasePath}. Run "bun run db:seed" to generate it.`,
    )
  }
}

const hasCommissionKeywordColumn = (db: BetterSqlite3Database): boolean => {
  const columns = db.prepare('PRAGMA table_info(commissions)').all() as Array<{
    name?: string | null
  }>
  return columns.some(column => column.name === 'keyword')
}

const ensureCommissionKeywordColumn = (db: BetterSqlite3Database) => {
  if (hasCommissionKeywordColumn(db)) return
  db.prepare('ALTER TABLE commissions ADD COLUMN keyword TEXT').run()
}

const normalizeKeyword = (value?: string | null): string | null => {
  const raw = value?.trim()
  if (!raw) return null

  const keywords = raw
    .split(/[,\n，、;；]/)
    .map(keyword => keyword.trim())
    .filter(Boolean)

  if (keywords.length === 0) return null

  const uniqueKeywords = Array.from(new Set(keywords))
  return uniqueKeywords.join(', ')
}

const openDatabase = (readonly: boolean) => {
  ensureDatabaseExists()

  const db = new Database(databasePath, {
    readonly,
    fileMustExist: true,
  })

  db.pragma('busy_timeout = 5000')

  if (!readonly) {
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = DELETE')
    ensureCommissionKeywordColumn(db)
  }

  return db
}

const withDatabase = <TReturn>(
  options: { readonly: boolean },
  handler: (db: BetterSqlite3Database) => TReturn,
): TReturn => {
  const db = openDatabase(options.readonly)
  try {
    return handler(db)
  } finally {
    db.close()
  }
}

const withReadOnlyDatabase = <TReturn>(handler: (db: BetterSqlite3Database) => TReturn) =>
  withDatabase({ readonly: true }, handler)

const withWritableDatabase = <TReturn>(handler: (db: BetterSqlite3Database) => TReturn) =>
  withDatabase({ readonly: false }, handler)

export const getAdminData = (): AdminData =>
  withReadOnlyDatabase(db => {
    const hasKeywordColumn = hasCommissionKeywordColumn(db)
    const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword,' : 'NULL as keyword,'

    const rawCharacters = db
      .prepare(
        `
        SELECT
          characters.id as id,
          characters.name as name,
          characters.status as status,
          characters.sort_order as sortOrder,
          COUNT(commissions.id) as commissionCount
        FROM characters
        LEFT JOIN commissions ON commissions.character_id = characters.id
        GROUP BY characters.id
        ORDER BY characters.sort_order ASC
      `,
      )
      .all() as Array<{
      id: number
      name: string
      status: CharacterStatus
      sortOrder: number
      commissionCount: number
    }>

    const characters: CharacterRow[] = rawCharacters.map(row => ({
      ...row,
      commissionCount: Number(row.commissionCount ?? 0),
    }))

    const rawCommissions = db
      .prepare(
        `
        SELECT
          commissions.id as id,
          commissions.character_id as characterId,
          characters.name as characterName,
          commissions.file_name as fileName,
          commissions.links as links,
          commissions.design as design,
          commissions.description as description,
          ${keywordSelect}
          commissions.hidden as hidden
        FROM commissions
        JOIN characters ON characters.id = commissions.character_id
        ORDER BY characters.sort_order ASC, commissions.file_name DESC
      `,
      )
      .all() as Array<{
      id: number
      characterId: number
      characterName: string
      fileName: string
      links: string
      design?: string | null
      description?: string | null
      keyword?: string | null
      hidden: number
    }>

    const commissions: CommissionRow[] = rawCommissions.map(row => ({
      id: row.id,
      characterId: row.characterId,
      characterName: row.characterName,
      fileName: row.fileName,
      links: JSON.parse(row.links) as string[],
      design: row.design ?? null,
      description: row.description ?? null,
      keyword: row.keyword ?? null,
      hidden: Boolean(row.hidden),
    }))

    return { characters, commissions }
  })

const ensureWritable = () => {
  if (!isDevelopment) {
    throw new Error('Writable database operations are only available in development mode.')
  }
}

export const createCharacter = (input: { name: string; status: CharacterStatus }) => {
  ensureWritable()

  const name = input.name.trim()
  if (!name) {
    throw new Error('Character name is required.')
  }

  withWritableDatabase(db => {
    const maxOrderRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM characters')
      .get() as { maxOrder: number }

    db.prepare(
      'INSERT INTO characters (name, status, sort_order) VALUES (@name, @status, @sortOrder)',
    ).run({
      name,
      status: input.status,
      sortOrder: Number(maxOrderRow?.maxOrder ?? 0) + 1,
    })
  })
}

export const updateCharacter = (input: { id: number; name: string; status: CharacterStatus }) => {
  ensureWritable()

  const trimmed = input.name.trim()
  if (!trimmed) {
    throw new Error('Character name is required.')
  }

  withWritableDatabase(db => {
    db.prepare('UPDATE characters SET name = @name, status = @status WHERE id = @id').run({
      id: input.id,
      name: trimmed,
      status: input.status,
    })
  })
}

interface CharacterOrderPayload {
  active: number[]
  stale: number[]
}

export const updateCharactersOrder = ({ active, stale }: CharacterOrderPayload) => {
  ensureWritable()

  if (
    !Array.isArray(active) ||
    !Array.isArray(stale) ||
    active.some(id => typeof id !== 'number') ||
    stale.some(id => typeof id !== 'number')
  ) {
    throw new Error('Invalid character order payload.')
  }

  withWritableDatabase(db => {
    const updateStatement = db.prepare(
      'UPDATE characters SET sort_order = @sortOrder, status = @status WHERE id = @id',
    )

    const transaction = db.transaction(() => {
      const combined = [
        ...active.map<[number, CharacterStatus]>(id => [id, 'active']),
        ...stale.map<[number, CharacterStatus]>(id => [id, 'stale']),
      ]

      combined.forEach(([id, status], index) => {
        updateStatement.run({ id, sortOrder: index + 1, status })
      })
    })

    transaction()
  })
}

export const createCommission = (input: {
  characterId: number
  fileName: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden?: boolean
}): { characterName: string } => {
  ensureWritable()

  return withWritableDatabase(db => {
    const characterRecord = db
      .prepare('SELECT id, name FROM characters WHERE id = @id')
      .get({ id: input.characterId }) as { id: number; name: string } | undefined

    if (!characterRecord) {
      throw new Error('Selected character does not exist.')
    }

    db.prepare(
      `
      INSERT INTO commissions (
        character_id,
        file_name,
        links,
        design,
        description,
        keyword,
        hidden
      ) VALUES (
        @characterId,
        @fileName,
        @links,
        @design,
        @description,
        @keyword,
        @hidden
      )
    `,
    ).run({
      characterId: characterRecord.id,
      fileName: input.fileName.trim(),
      links: JSON.stringify(input.links),
      design: input.design ?? null,
      description: input.description ?? null,
      keyword: normalizeKeyword(input.keyword),
      hidden: input.hidden ? 1 : 0,
    })

    return { characterName: characterRecord.name }
  })
}

export const updateCommission = (input: {
  id: number
  characterId: number
  fileName: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden?: boolean
}) => {
  ensureWritable()

  withWritableDatabase(db => {
    const characterRecord = db
      .prepare('SELECT id FROM characters WHERE id = @id')
      .get({ id: input.characterId }) as { id: number } | undefined

    if (!characterRecord) {
      throw new Error('Selected character does not exist.')
    }

    db.prepare(
      `
      UPDATE commissions
      SET
        character_id = @characterId,
        file_name = @fileName,
        links = @links,
        design = @design,
        description = @description,
        keyword = @keyword,
        hidden = @hidden
      WHERE id = @id
    `,
    ).run({
      id: input.id,
      characterId: characterRecord.id,
      fileName: input.fileName.trim(),
      links: JSON.stringify(input.links),
      design: input.design ?? null,
      description: input.description ?? null,
      keyword: normalizeKeyword(input.keyword),
      hidden: input.hidden ? 1 : 0,
    })
  })
}

export type { CharacterRow, CommissionRow }

export const deleteCharacter = (id: number) => {
  ensureWritable()

  withWritableDatabase(db => {
    const existing = db.prepare('SELECT name FROM characters WHERE id = @id').get({ id }) as
      | { name: string }
      | undefined

    if (!existing) {
      throw new Error('Character not found.')
    }

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM commissions WHERE character_id = @characterId').run({
        characterId: id,
      })
      db.prepare('DELETE FROM characters WHERE id = @id').run({ id })
    })

    transaction()
  })
}

export const deleteCommission = (id: number) => {
  ensureWritable()

  withWritableDatabase(db => {
    db.prepare('DELETE FROM commissions WHERE id = @id').run({ id })
  })
}
