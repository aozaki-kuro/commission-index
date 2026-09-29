import {
  normalizeAliases,
  normalizeCharacterAliases,
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  normalizeCreatorName,
  normalizeKeywordAliases,
  normalizeKeywordAliasKey,
  normalizeKeywordBaseTerm,
  splitKeywordTerms,
} from '../../../packages/domain/src/index'

interface D1ResultLike {
  success?: boolean
}

export interface D1ResultSetLike<TRow = Record<string, unknown>> {
  results?: TRow[]
}

export interface D1BoundStatementLike {
  all: <TRow = Record<string, unknown>>() => Promise<D1ResultSetLike<TRow>>
  run: () => Promise<D1ResultLike>
}

export interface D1PreparedStatementLike extends D1BoundStatementLike {
  bind: (...values: unknown[]) => D1PreparedStatementLike
}

export interface D1DatabaseLike {
  batch?: (statements: D1PreparedStatementLike[]) => Promise<D1ResultLike[]>
  prepare: (query: string) => D1PreparedStatementLike
}

type CharacterStatus = 'active' | 'archived'

interface MaxSortOrderRow {
  maxOrder?: number | null
}

interface CharacterIdRow {
  id: number
}

interface CharacterNameRow {
  name: string
}

interface CharacterRecordRow {
  id: number
  name: string
}

interface CommissionFileNameRow {
  fileName: string
}

interface NormalizedCommissionMutation {
  characterId: number
  commissionDate: string
  creatorName: string | null
  description: string | null
  design: string | null
  fileName?: string
  hidden: number
  keyword: string | null
  links: string
}

interface CharacterOrderPayload {
  active: number[]
  archived: number[]
}

interface SourceImageMetadataInput {
  byteSize: number
  commissionFileName: string
  mimeType: string
  objectKey: string
  sha256: string
}

const MAX_FEATURED_SEARCH_KEYWORDS = 6
const NORMALIZE_SPACES_PATTERN = /\s+/g

const CREATE_CREATOR_ALIASES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS creator_aliases (
    creator_name TEXT PRIMARY KEY,
    aliases TEXT NOT NULL
  )
`

const CREATE_CHARACTER_ALIASES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS character_aliases (
    character_name TEXT PRIMARY KEY,
    aliases TEXT NOT NULL
  )
`

const CREATE_KEYWORD_ALIASES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS keyword_aliases (
    base_keyword TEXT PRIMARY KEY,
    aliases TEXT NOT NULL
  )
`

const CREATE_HOME_FEATURED_SEARCH_KEYWORDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS home_featured_search_keywords (
    keyword TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL
  )
`

const CREATE_SOURCE_IMAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS source_images (
    commission_file_name TEXT PRIMARY KEY,
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`

function normalizeKeyword(value: string) {
  return value.trim().replace(NORMALIZE_SPACES_PATTERN, ' ')
}

function normalizeCommissionKeyword(value?: string | null) {
  const keywords = splitKeywordTerms(value)
  if (keywords.length === 0) {
    return null
  }

  return normalizeKeywordAliases(keywords).join(', ')
}

function normalizeCommissionMutation(input: {
  characterId: number
  commissionDate: string
  creatorName?: string | null
  fileName?: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden?: boolean
}): NormalizedCommissionMutation {
  const commissionDate = input.commissionDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(commissionDate) || Number.isNaN(Date.parse(`${commissionDate}T00:00:00Z`))) {
    throw new Error('Commission date must use YYYY-MM-DD format.')
  }
  const date = new Date(`${commissionDate}T00:00:00Z`)
  if (date.toISOString().slice(0, 10) !== commissionDate) {
    throw new Error('Commission date must be a real calendar date.')
  }

  return {
    characterId: input.characterId,
    commissionDate,
    creatorName: input.creatorName?.trim() || null,
    fileName: input.fileName,
    links: JSON.stringify(input.links),
    design: input.design ?? null,
    description: input.description ?? null,
    keyword: normalizeCommissionKeyword(input.keyword),
    hidden: input.hidden ? 1 : 0,
  }
}

function dedupeKeywords(keywords: Iterable<string>, maxCount = Number.POSITIVE_INFINITY) {
  const uniqueKeywords: string[] = []
  const seen = new Set<string>()

  for (const keyword of keywords) {
    const normalized = normalizeKeyword(keyword)
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueKeywords.push(normalized)

    if (uniqueKeywords.length >= maxCount) {
      break
    }
  }

  return uniqueKeywords
}

async function runStatement(db: D1DatabaseLike, query: string, values: unknown[] = []) {
  const statement = db.prepare(query)
  const runnable = values.length > 0 ? statement.bind(...values) : statement
  const result = await runnable.run()

  if (result.success === false) {
    throw new Error('D1 write operation failed.')
  }
}

async function runStatementsAtomically(
  db: D1DatabaseLike,
  operations: Array<{ query: string, values?: unknown[] }>,
) {
  if (operations.length === 0) {
    return
  }
  const statements = operations.map(({ query, values = [] }) => {
    const statement = db.prepare(query)
    return values.length > 0 ? statement.bind(...values) : statement
  })

  if (!db.batch) {
    throw new Error('D1 batch support is required for atomic write operations.')
  }

  const results = await db.batch(statements)
  if (results.some(result => result.success === false)) {
    throw new Error('D1 write operation failed.')
  }
}

async function queryRows<TRow>(
  db: D1DatabaseLike,
  query: string,
  values: unknown[] = [],
): Promise<TRow[]> {
  const statement = values.length > 0 ? db.prepare(query).bind(...values) : db.prepare(query)
  const result = await statement.all<TRow>()
  return Array.isArray(result.results) ? result.results : []
}

async function queryFirstRow<TRow>(
  db: D1DatabaseLike,
  query: string,
  values: unknown[] = [],
): Promise<TRow | null> {
  const rows = await queryRows<TRow>(db, query, values)
  return rows[0] ?? null
}

async function ensureCreatorAliasesTable(db: D1DatabaseLike) {
  await runStatement(db, CREATE_CREATOR_ALIASES_TABLE_SQL)
}

async function ensureCharacterAliasesTable(db: D1DatabaseLike) {
  await runStatement(db, CREATE_CHARACTER_ALIASES_TABLE_SQL)
}

async function ensureKeywordAliasesTable(db: D1DatabaseLike) {
  await runStatement(db, CREATE_KEYWORD_ALIASES_TABLE_SQL)
}

async function ensureHomeFeaturedSearchKeywordsTable(db: D1DatabaseLike) {
  await runStatement(db, CREATE_HOME_FEATURED_SEARCH_KEYWORDS_TABLE_SQL)
}

async function ensureSourceImagesTable(db: D1DatabaseLike) {
  await runStatement(db, CREATE_SOURCE_IMAGES_TABLE_SQL)
}

export async function createCharacter(
  db: D1DatabaseLike,
  input: { name: string, status: CharacterStatus },
) {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Character name is required.')
  }

  const maxOrderRow = await queryFirstRow<MaxSortOrderRow>(
    db,
    'SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM characters',
  )

  await runStatement(
    db,
    'INSERT INTO characters (name, status, sort_order) VALUES (?, ?, ?)',
    [name, input.status, Number(maxOrderRow?.maxOrder ?? 0) + 1],
  )

  return name
}

export async function updateCharacter(
  db: D1DatabaseLike,
  input: { id: number, name: string, status: CharacterStatus },
) {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Character name is required.')
  }

  const existing = await queryFirstRow<CharacterIdRow>(
    db,
    'SELECT id FROM characters WHERE id = ? LIMIT 1',
    [input.id],
  )

  if (!existing) {
    throw new Error('Character not found.')
  }

  await runStatement(
    db,
    'UPDATE characters SET name = ?, status = ? WHERE id = ?',
    [name, input.status, input.id],
  )

  return name
}

export async function updateCharacterOrder(
  db: D1DatabaseLike,
  payload: CharacterOrderPayload,
) {
  const { active, archived } = payload
  if (
    !Array.isArray(active)
    || !Array.isArray(archived)
    || active.some(id => !Number.isSafeInteger(id) || id <= 0)
    || archived.some(id => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw new Error('Invalid character order payload.')
  }

  const activeIds = active.map(Number)
  const archivedIds = archived.map(Number)
  const orderedIds = [...activeIds, ...archivedIds]
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('Character order payload contains duplicate identifiers.')
  }

  if (orderedIds.length === 0) {
    return
  }

  const existingRows = await queryRows<CharacterIdRow>(
    db,
    `SELECT id FROM characters WHERE id IN (${orderedIds.map(() => '?').join(', ')})`,
    orderedIds,
  )
  if (existingRows.length !== orderedIds.length) {
    throw new Error('Character order payload must include existing character identifiers only.')
  }

  const buildOrderUpdate = (ids: number[], status: CharacterStatus, offset: number) => {
    if (ids.length === 0) {
      return null
    }
    const cases = ids.map(() => 'WHEN ? THEN ?').join(' ')
    return {
      query: `UPDATE characters SET sort_order = CASE id ${cases} END, status = ? WHERE id IN (${ids.map(() => '?').join(', ')})`,
      values: [...ids.flatMap((id, index) => [id, offset + index + 1]), status, ...ids],
    }
  }
  const operations = [
    buildOrderUpdate(activeIds, 'active', 0),
    buildOrderUpdate(archivedIds, 'archived', activeIds.length),
  ].filter((operation): operation is NonNullable<typeof operation> => operation !== null)

  await runStatementsAtomically(db, operations)
}

export async function deleteCharacter(db: D1DatabaseLike, id: number) {
  const existing = await queryFirstRow<CharacterNameRow>(
    db,
    'SELECT name FROM characters WHERE id = ? LIMIT 1',
    [id],
  )

  if (!existing) {
    throw new Error('Character not found.')
  }

  await ensureSourceImagesTable(db)
  await runStatementsAtomically(db, [
    {
      query: 'DELETE FROM source_images WHERE commission_file_name IN (SELECT file_name FROM commissions WHERE character_id = ?)',
      values: [id],
    },
    { query: 'DELETE FROM commissions WHERE character_id = ?', values: [id] },
    { query: 'DELETE FROM characters WHERE id = ?', values: [id] },
  ])
}

export async function createCommission(
  db: D1DatabaseLike,
  input: {
    characterId: number
    commissionDate: string
    creatorName?: string | null
    fileName: string
    links: string[]
    design?: string | null
    description?: string | null
    keyword?: string | null
    hidden?: boolean
  },
  sourceImage: SourceImageMetadataInput,
) {
  const normalizedInput = normalizeCommissionMutation(input)

  const characterRecord = await queryFirstRow<CharacterRecordRow>(
    db,
    'SELECT id, name FROM characters WHERE id = ? LIMIT 1',
    [normalizedInput.characterId],
  )

  if (!characterRecord) {
    throw new Error('Selected character does not exist.')
  }

  await ensureSourceImagesTable(db)
  await runStatementsAtomically(db, [
    {
      query: `
      INSERT INTO commissions (
        character_id,
        commission_date,
        creator_name,
        file_name,
        links,
        design,
        description,
        keyword,
        hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values: [
        characterRecord.id,
        normalizedInput.commissionDate,
        normalizedInput.creatorName,
        normalizedInput.fileName,
        normalizedInput.links,
        normalizedInput.design,
        normalizedInput.description,
        normalizedInput.keyword,
        normalizedInput.hidden,
      ],
    },
    {
      query: `
        INSERT INTO source_images (
          commission_file_name, commission_id, object_key, mime_type, byte_size, sha256, updated_at
        ) VALUES (?, (SELECT id FROM commissions WHERE file_name = ?), ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(commission_file_name) DO UPDATE SET
          commission_id = excluded.commission_id,
          object_key = excluded.object_key,
          mime_type = excluded.mime_type,
          byte_size = excluded.byte_size,
          sha256 = excluded.sha256,
          updated_at = CURRENT_TIMESTAMP
      `,
      values: [sourceImage.commissionFileName, sourceImage.commissionFileName, sourceImage.objectKey, sourceImage.mimeType, sourceImage.byteSize, sourceImage.sha256],
    },
  ])

  return {
    characterName: characterRecord.name,
  }
}

export async function updateCommission(
  db: D1DatabaseLike,
  input: {
    id: number
    characterId: number
    commissionDate: string
    creatorName?: string | null
    links: string[]
    design?: string | null
    description?: string | null
    keyword?: string | null
    hidden?: boolean
  },
) {
  const normalizedInput = normalizeCommissionMutation(input)
  const currentCommission = await queryFirstRow<NormalizedCommissionMutation>(
    db,
    `
      SELECT
        character_id as characterId,
        commission_date as commissionDate,
        creator_name as creatorName,
        links as links,
        design as design,
        description as description,
        keyword as keyword,
        hidden as hidden
      FROM commissions
      WHERE id = ?
      LIMIT 1
    `,
    [input.id],
  )

  if (!currentCommission) {
    throw new Error('Commission not found.')
  }

  const characterRecord = await queryFirstRow<CharacterIdRow>(
    db,
    'SELECT id FROM characters WHERE id = ? LIMIT 1',
    [normalizedInput.characterId],
  )

  if (!characterRecord) {
    throw new Error('Selected character does not exist.')
  }

  normalizedInput.characterId = characterRecord.id

  const isUnchanged
    = currentCommission.characterId === normalizedInput.characterId
      && currentCommission.commissionDate === normalizedInput.commissionDate
      && currentCommission.creatorName === normalizedInput.creatorName
      && currentCommission.links === normalizedInput.links
      && currentCommission.design === normalizedInput.design
      && currentCommission.description === normalizedInput.description
      && currentCommission.keyword === normalizedInput.keyword
      && Number(currentCommission.hidden) === normalizedInput.hidden

  if (isUnchanged) {
    return false
  }

  const updateOperation = {
    query: `
      UPDATE commissions
      SET
        character_id = ?,
        commission_date = ?,
        creator_name = ?,
        links = ?,
        design = ?,
        description = ?,
        keyword = ?,
        hidden = ?
      WHERE id = ?
    `,
    values: [
      normalizedInput.characterId,
      normalizedInput.commissionDate,
      normalizedInput.creatorName,
      normalizedInput.links,
      normalizedInput.design,
      normalizedInput.description,
      normalizedInput.keyword,
      normalizedInput.hidden,
      input.id,
    ],
  }

  await runStatement(db, updateOperation.query, updateOperation.values)

  return true
}

export async function deleteCommission(db: D1DatabaseLike, id: number) {
  const existing = await queryFirstRow<CommissionFileNameRow>(
    db,
    'SELECT file_name as fileName FROM commissions WHERE id = ? LIMIT 1',
    [id],
  )

  if (!existing) {
    return
  }

  await ensureSourceImagesTable(db)
  await runStatementsAtomically(db, [
    { query: 'DELETE FROM source_images WHERE commission_file_name = ?', values: [existing.fileName] },
    { query: 'DELETE FROM commissions WHERE id = ?', values: [id] },
  ])
}

export async function deleteCommissionByFileName(db: D1DatabaseLike, fileName: string) {
  await ensureSourceImagesTable(db)
  await runStatementsAtomically(db, [
    { query: 'DELETE FROM source_images WHERE commission_file_name = ?', values: [fileName] },
    { query: 'DELETE FROM commissions WHERE file_name = ?', values: [fileName] },
  ])
}

export async function getCommissionFileName(db: D1DatabaseLike, id: number) {
  const row = await queryFirstRow<CommissionFileNameRow>(
    db,
    'SELECT file_name as fileName FROM commissions WHERE id = ? LIMIT 1',
    [id],
  )

  if (!row?.fileName) {
    throw new Error('Commission not found.')
  }

  return row.fileName
}

export async function saveSourceImageMetadata(
  db: D1DatabaseLike,
  input: SourceImageMetadataInput,
) {
  await ensureSourceImagesTable(db)
  await runStatement(
    db,
    `
      INSERT INTO source_images (
        commission_file_name,
        commission_id,
        object_key,
        mime_type,
        byte_size,
        sha256,
        updated_at
      ) VALUES (?, (SELECT id FROM commissions WHERE file_name = ?), ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(commission_file_name) DO UPDATE SET
        commission_id = excluded.commission_id,
        object_key = excluded.object_key,
        mime_type = excluded.mime_type,
        byte_size = excluded.byte_size,
        sha256 = excluded.sha256,
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      input.commissionFileName,
      input.commissionFileName,
      input.objectKey,
      input.mimeType,
      input.byteSize,
      input.sha256,
    ],
  )
}

export async function getSourceImageMetadata(db: D1DatabaseLike, commissionFileName: string) {
  await ensureSourceImagesTable(db)
  return queryFirstRow<{
    objectKey: string
    mimeType: string
    byteSize: number
    sha256: string
  }>(
    db,
    'SELECT object_key as objectKey, mime_type as mimeType, byte_size as byteSize, sha256 FROM source_images WHERE commission_file_name = ? LIMIT 1',
    [commissionFileName],
  )
}

export async function deleteSourceImageMetadata(db: D1DatabaseLike, commissionFileName: string) {
  await ensureSourceImagesTable(db)
  await runStatement(
    db,
    'DELETE FROM source_images WHERE commission_file_name = ?',
    [commissionFileName],
  )
}

export async function deleteSourceImageMetadataIfMatches(
  db: D1DatabaseLike,
  commissionFileName: string,
  objectKey: string,
) {
  await ensureSourceImagesTable(db)
  await runStatement(
    db,
    'DELETE FROM source_images WHERE commission_file_name = ? AND object_key = ?',
    [commissionFileName, objectKey],
  )
}

export async function saveCreatorAliasesBatch(
  db: D1DatabaseLike,
  rows: Array<{ creatorName: string, aliases: string[] | string }>,
) {
  const mergedRows = new Map<string, string[]>()

  rows.forEach((row) => {
    const creatorName = normalizeCreatorName(row.creatorName)
    if (!creatorName) {
      return
    }

    const aliases = normalizeAliases(row.aliases)
    mergedRows.set(
      creatorName,
      normalizeAliases([...(mergedRows.get(creatorName) ?? []), ...aliases]),
    )
  })

  await ensureCreatorAliasesTable(db)
  await runStatementsAtomically(db, [...mergedRows.entries()].map(([creatorName, aliases]) => aliases.length === 0
    ? { query: 'DELETE FROM creator_aliases WHERE creator_name = ?', values: [creatorName] }
    : {
        query: `
        INSERT INTO creator_aliases (creator_name, aliases)
        VALUES (?, ?)
        ON CONFLICT(creator_name) DO UPDATE SET aliases = excluded.aliases
      `,
        values: [creatorName, JSON.stringify(aliases)],
      }))
}

export async function saveCharacterAliasesBatch(
  db: D1DatabaseLike,
  rows: Array<{ characterName: string, aliases: string[] | string }>,
) {
  const mergedRows = new Map<string, { characterName: string, aliases: string[] }>()

  rows.forEach((row) => {
    const characterName = normalizeCharacterAliasName(row.characterName)
    if (!characterName) {
      return
    }

    const key = normalizeCharacterAliasKey(characterName)
    if (!key) {
      return
    }

    const aliases = normalizeCharacterAliases(row.aliases)
    const previous = mergedRows.get(key)
    mergedRows.set(key, {
      characterName: previous?.characterName ?? characterName,
      aliases: normalizeCharacterAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  })

  await ensureCharacterAliasesTable(db)
  await runStatementsAtomically(db, [...mergedRows.values()].map(row => row.aliases.length === 0
    ? { query: 'DELETE FROM character_aliases WHERE character_name = ?', values: [row.characterName] }
    : {
        query: `
        INSERT INTO character_aliases (character_name, aliases)
        VALUES (?, ?)
        ON CONFLICT(character_name) DO UPDATE SET aliases = excluded.aliases
      `,
        values: [row.characterName, JSON.stringify(row.aliases)],
      }))
}

export async function saveKeywordAliasesBatch(
  db: D1DatabaseLike,
  rows: Array<{ baseKeyword: string, aliases: string[] | string }>,
) {
  const mergedRows = new Map<string, { baseKeyword: string, aliases: string[] }>()

  rows.forEach((row) => {
    const baseKeyword = normalizeKeywordBaseTerm(row.baseKeyword)
    if (!baseKeyword) {
      return
    }

    const key = normalizeKeywordAliasKey(baseKeyword)
    if (!key) {
      return
    }

    const aliases = normalizeKeywordAliases(row.aliases)
    const previous = mergedRows.get(key)
    mergedRows.set(key, {
      baseKeyword: previous?.baseKeyword ?? baseKeyword,
      aliases: normalizeKeywordAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  })

  await ensureKeywordAliasesTable(db)
  await runStatementsAtomically(db, [...mergedRows.values()].map(row => row.aliases.length === 0
    ? { query: 'DELETE FROM keyword_aliases WHERE base_keyword = ?', values: [row.baseKeyword] }
    : {
        query: `
        INSERT INTO keyword_aliases (base_keyword, aliases)
        VALUES (?, ?)
        ON CONFLICT(base_keyword) DO UPDATE SET aliases = excluded.aliases
      `,
        values: [row.baseKeyword, JSON.stringify(row.aliases)],
      }))
}

export async function saveHomeFeaturedSearchKeywords(db: D1DatabaseLike, keywords: string[]) {
  const normalizedKeywords = dedupeKeywords(keywords, MAX_FEATURED_SEARCH_KEYWORDS)

  await ensureHomeFeaturedSearchKeywordsTable(db)
  const operations: Array<{ query: string, values?: unknown[] }> = [
    { query: 'DELETE FROM home_featured_search_keywords' },
  ]
  if (normalizedKeywords.length > 0) {
    const placeholders = normalizedKeywords.map(() => '(?, ?)').join(', ')
    const values = normalizedKeywords.flatMap((keyword, index) => [keyword, index + 1])
    operations.push({
      query: `INSERT INTO home_featured_search_keywords (keyword, sort_order) VALUES ${placeholders}`,
      values,
    })
  }
  await runStatementsAtomically(db, operations)
}
