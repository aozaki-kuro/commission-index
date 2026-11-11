import type { CharacterStatus } from '../../../packages/domain/src/index'
import {
  dedupeKeywords,
  normalizeAliases,
  normalizeCharacterAliases,
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  normalizeCreatorName,
  normalizeKeywordAliases,
  normalizeKeywordAliasKey,
  normalizeKeywordBaseTerm,
  parseCharacterAliasesJson,
  splitKeywordTerms,
} from '../../../packages/domain/src/index'
import { validateCommissionDate, validateCommissionWorkGroup } from './commissionValidation'

// adminData imports dedupeKeywords from here.
export { dedupeKeywords }

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

interface CharacterIdRow {
  id: number
  name: string
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

interface SourceImageObjectKeyRow {
  objectKey: string
}

interface NormalizedCommissionMutation {
  characterId: number
  commissionDate: string
  creatorName: string | null
  workGroupId: string | null
  partNumber: number | null
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

export const MAX_FEATURED_SEARCH_KEYWORDS = 6

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

// Must stay identical to the table that migrations 0002 + 0004 produce (column order included): writes bind
// commission_id. The partial unique index from 0004 is not recreated here; D1 prepares one statement at a time.
const CREATE_SOURCE_IMAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS source_images (
    commission_file_name TEXT PRIMARY KEY,
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commission_id INTEGER REFERENCES commissions(id) ON DELETE CASCADE
  )
`

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
  workGroupId?: string | null
  partNumber?: number | null
  fileName?: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden?: boolean
}): NormalizedCommissionMutation {
  const commissionDate = input.commissionDate.trim()
  const dateError = validateCommissionDate(commissionDate)
  if (dateError) {
    throw new Error(dateError)
  }

  const rawWorkGroupId = input.workGroupId?.trim().toLowerCase() || null
  const partNumber = input.partNumber ?? null
  const workGroupError = validateCommissionWorkGroup(rawWorkGroupId, partNumber)
  if (workGroupError) {
    throw new Error(workGroupError)
  }
  const workGroupId = rawWorkGroupId === 'new'
    ? crypto.randomUUID().toLowerCase()
    : rawWorkGroupId

  return {
    characterId: input.characterId,
    commissionDate,
    creatorName: input.creatorName?.trim() || null,
    workGroupId,
    partNumber,
    fileName: input.fileName,
    links: JSON.stringify(input.links),
    design: input.design ?? null,
    description: input.description ?? null,
    keyword: normalizeCommissionKeyword(input.keyword),
    hidden: input.hidden ? 1 : 0,
  }
}

export function resolveD1Database(value: unknown): D1DatabaseLike | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { prepare?: unknown }
  if (typeof candidate.prepare !== 'function') {
    return null
  }

  return value as D1DatabaseLike
}

async function runStatement(db: D1DatabaseLike, query: string, values: unknown[] = []) {
  const statement = db.prepare(query)
  const runnable = values.length > 0
    ? statement.bind(...values)
    : statement
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
    return values.length > 0
      ? statement.bind(...values)
      : statement
  })

  if (!db.batch) {
    throw new Error('D1 batch support is required for atomic write operations.')
  }

  const results = await db.batch(statements)
  if (results.some(result => result.success === false)) {
    throw new Error('D1 write operation failed.')
  }
}

export async function queryRows<TRow>(
  db: D1DatabaseLike,
  query: string,
  values: unknown[] = [],
): Promise<TRow[]> {
  const statement = values.length > 0
    ? db.prepare(query).bind(...values)
    : db.prepare(query)
  const result = await statement.all<TRow>()
  return Array.isArray(result.results)
    ? result.results
    : []
}

export async function queryFirstRow<TRow>(
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

  // One statement, so two concurrent creates cannot both read the same max and share a sort_order.
  await runStatement(
    db,
    'INSERT INTO characters (name, status, sort_order) SELECT ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM characters',
    [name, input.status],
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
    'SELECT id, name FROM characters WHERE id = ? LIMIT 1',
    [input.id],
  )

  if (!existing) {
    throw new Error('Character not found.')
  }

  const operations: Array<{ query: string, values?: unknown[] }> = [
    {
      query: 'UPDATE characters SET name = ?, status = ? WHERE id = ?',
      values: [name, input.status, input.id],
    },
  ]

  // character_aliases is keyed by the exact name, so a rename must re-home its row in the same batch or the
  // aliases silently stop applying.
  if (existing.name !== name) {
    await ensureCharacterAliasesTable(db)
    const oldKey = normalizeCharacterAliasKey(existing.name)
    const newKey = normalizeCharacterAliasKey(name)
    const results = await queryRows<{ character_name: string, aliases: string }>(
      db,
      'SELECT character_name, aliases FROM character_aliases',
    )
    const oldRows = results.filter(row => normalizeCharacterAliasKey(row.character_name) === oldKey)
    const targetRows = results.filter(row => normalizeCharacterAliasKey(row.character_name) === newKey)

    if (oldRows.length > 0 || targetRows.length > 0) {
      // Merge rather than replace so renaming back (A -> B -> A) recovers aliases left behind under the old name.
      const aliases = normalizeCharacterAliases([
        ...targetRows.flatMap(row => parseCharacterAliasesJson(row.aliases)),
        ...oldRows.flatMap(row => parseCharacterAliasesJson(row.aliases)),
      ])
      for (const row of [
        ...oldRows,
        ...targetRows,
      ]) {
        operations.push({
          query: 'DELETE FROM character_aliases WHERE character_name = ?',
          values: [row.character_name],
        })
      }
      if (aliases.length > 0) {
        operations.push({
          query: 'INSERT INTO character_aliases (character_name, aliases) VALUES (?, ?)',
          values: [
            name,
            JSON.stringify(aliases),
          ],
        })
      }
    }
  }

  await runStatementsAtomically(db, operations)

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

  const orderedIds = [
    ...active,
    ...archived,
  ]
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('Character order payload contains duplicate identifiers.')
  }

  if (orderedIds.length === 0) {
    return
  }

  // D1 caps a statement at 100 bound parameters, so neither the existence check nor the updates may bind every id.
  const existingIds = new Set((await queryRows<{ id: number }>(db, 'SELECT id FROM characters'))
    .map(row => Number(row.id)))
  if (orderedIds.some(id => !existingIds.has(id))) {
    throw new Error('Character order payload must include existing character identifiers only.')
  }

  const statuses: CharacterStatus[] = [
    ...active.map(() => 'active' as const),
    ...archived.map(() => 'archived' as const),
  ]
  await runStatementsAtomically(db, orderedIds.map((id, index) => ({
    query: 'UPDATE characters SET sort_order = ?, status = ? WHERE id = ?',
    values: [index + 1, statuses[index], id],
  })))
}

// Rows link to a commission by commission_id (0004) or, legacy, by commission_file_name. The SELECT and
// DELETE must share this predicate so the returned keys are exactly the rows the cascade removes.
const CHARACTER_SOURCE_IMAGE_PREDICATE = `(
  commission_id IN (SELECT id FROM commissions WHERE character_id = ?)
  OR commission_file_name IN (SELECT file_name FROM commissions WHERE character_id = ?)
)`

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
  // Read the object_key values before the delete: once the rows are gone they can no longer be located, so the orphans become untraceable.
  const objectKeys = (await queryRows<SourceImageObjectKeyRow>(
    db,
    `SELECT object_key as objectKey FROM source_images WHERE ${CHARACTER_SOURCE_IMAGE_PREDICATE}`,
    [id, id],
  )).map(row => row.objectKey)

  await runStatementsAtomically(db, [
    {
      query: `DELETE FROM source_images WHERE ${CHARACTER_SOURCE_IMAGE_PREDICATE}`,
      values: [id, id],
    },
    {
      query: 'DELETE FROM commissions WHERE character_id = ?',
      values: [id],
    },
    {
      query: 'DELETE FROM characters WHERE id = ?',
      values: [id],
    },
  ])

  // Check survivors only after the commit: a key is safe to remove once no committed row references it.
  // New uploads get fresh UUID keys, so no concurrent insert can start referencing a candidate key here.
  const survivingKeys = new Set((await queryRows<SourceImageObjectKeyRow>(
    db,
    'SELECT DISTINCT object_key as objectKey FROM source_images',
  )).map(row => row.objectKey))
  return [
    ...new Set(objectKeys),
  ].filter(key => !survivingKeys.has(key))
}

export async function createCommission(
  db: D1DatabaseLike,
  input: {
    characterId: number
    commissionDate: string
    creatorName?: string | null
    workGroupId?: string | null
    partNumber?: number | null
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
  const publicId = crypto.randomUUID().toLowerCase()
  await runStatementsAtomically(db, [
    ...(normalizedInput.workGroupId
      ? [
          {
            query: 'INSERT OR IGNORE INTO commission_groups (id) VALUES (?)',
            values: [normalizedInput.workGroupId],
          },
        ]
      : []),
    {
      query: `
      INSERT INTO commissions (
        public_id,
        character_id,
        commission_date,
        creator_name,
        work_group_id,
        part_number,
        file_name,
        links,
        design,
        description,
        keyword,
        hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values: [
        publicId,
        characterRecord.id,
        normalizedInput.commissionDate,
        normalizedInput.creatorName,
        normalizedInput.workGroupId,
        normalizedInput.partNumber,
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
      values: [
        sourceImage.commissionFileName,
        sourceImage.commissionFileName,
        sourceImage.objectKey,
        sourceImage.mimeType,
        sourceImage.byteSize,
        sourceImage.sha256,
      ],
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
    workGroupId?: string | null
    partNumber?: number | null
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
        work_group_id as workGroupId,
        part_number as partNumber,
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
      && currentCommission.workGroupId === normalizedInput.workGroupId
      && (currentCommission.partNumber ?? null) === normalizedInput.partNumber
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
        work_group_id = ?,
        part_number = ?,
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
      normalizedInput.workGroupId,
      normalizedInput.partNumber,
      normalizedInput.links,
      normalizedInput.design,
      normalizedInput.description,
      normalizedInput.keyword,
      normalizedInput.hidden,
      input.id,
    ],
  }

  await runStatementsAtomically(db, [
    ...(normalizedInput.workGroupId
      ? [
          {
            query: 'INSERT OR IGNORE INTO commission_groups (id) VALUES (?)',
            values: [normalizedInput.workGroupId],
          },
        ]
      : []),
    updateOperation,
  ])

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
    {
      query: 'DELETE FROM source_images WHERE commission_file_name = ?',
      values: [existing.fileName],
    },
    {
      query: 'DELETE FROM commissions WHERE id = ?',
      values: [id],
    },
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
  // INSERT ... SELECT writes nothing if the commission was deleted after the caller read its file name,
  // so no orphan row with a NULL commission_id can appear. RETURNING detects that without `meta.changes`.
  const written = await queryRows<{ commissionFileName: string }>(
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
      )
      SELECT file_name, id, ?, ?, ?, ?, CURRENT_TIMESTAMP FROM commissions WHERE file_name = ?
      ON CONFLICT(commission_file_name) DO UPDATE SET
        commission_id = excluded.commission_id,
        object_key = excluded.object_key,
        mime_type = excluded.mime_type,
        byte_size = excluded.byte_size,
        sha256 = excluded.sha256,
        updated_at = CURRENT_TIMESTAMP
      RETURNING commission_file_name AS commissionFileName
    `,
    [
      input.objectKey,
      input.mimeType,
      input.byteSize,
      input.sha256,
      input.commissionFileName,
    ],
  )

  if (written.length === 0) {
    throw new Error('Commission not found.')
  }
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

interface AliasTableConfig {
  name: 'creator_aliases' | 'character_aliases' | 'keyword_aliases'
  keyColumn: 'creator_name' | 'character_name' | 'base_keyword'
  ensureTable: (db: D1DatabaseLike) => Promise<void>
  normalizeName: (value: string) => string | null
  // Key that merges submitted rows; `normalizeKey(storedName)` must produce the same key for a stored row.
  mergeKey: (normalizedName: string) => string | null
  normalizeKey: (storedName: string) => string | null
  normalizeAliases: (aliases: string[] | string) => string[]
}

// Fixed table configs only: the table and column names are interpolated into SQL.
const CREATOR_ALIAS_TABLE: AliasTableConfig = {
  name: 'creator_aliases',
  keyColumn: 'creator_name',
  ensureTable: ensureCreatorAliasesTable,
  normalizeName: normalizeCreatorName,
  // Creator keys stay case-sensitive; only the `(part N)` suffix that reads strip is folded.
  mergeKey: name => name,
  normalizeKey: normalizeCreatorName,
  normalizeAliases,
}

const CHARACTER_ALIAS_TABLE: AliasTableConfig = {
  name: 'character_aliases',
  keyColumn: 'character_name',
  ensureTable: ensureCharacterAliasesTable,
  normalizeName: normalizeCharacterAliasName,
  mergeKey: normalizeCharacterAliasKey,
  normalizeKey: normalizeCharacterAliasKey,
  normalizeAliases: normalizeCharacterAliases,
}

const KEYWORD_ALIAS_TABLE: AliasTableConfig = {
  name: 'keyword_aliases',
  keyColumn: 'base_keyword',
  ensureTable: ensureKeywordAliasesTable,
  normalizeName: normalizeKeywordBaseTerm,
  mergeKey: normalizeKeywordAliasKey,
  normalizeKey: normalizeKeywordAliasKey,
  normalizeAliases: normalizeKeywordAliases,
}

// Alias tables are keyed by the exact stored name, but reads merge rows by each type's normalized key. A save must
// therefore replace every stored row with the submitted key, or a differently cased/spaced duplicate survives the
// save, keeps contributing aliases to reads, and can never be deleted through the API.
async function replaceAliasRowsAtomically(
  db: D1DatabaseLike,
  table: AliasTableConfig,
  rows: Map<string, { name: string, aliases: string[] }>,
) {
  if (rows.size === 0) {
    return
  }

  const storedNames = await queryRows<{ name: string }>(
    db,
    `SELECT ${table.keyColumn} AS name FROM ${table.name}`,
  )
  const operations: Array<{ query: string, values?: unknown[] }> = []
  for (const [key, row] of rows) {
    for (const stored of storedNames) {
      if (table.normalizeKey(stored.name) === key) {
        operations.push({
          query: `DELETE FROM ${table.name} WHERE ${table.keyColumn} = ?`,
          values: [stored.name],
        })
      }
    }
    if (row.aliases.length > 0) {
      operations.push({
        query: `INSERT INTO ${table.name} (${table.keyColumn}, aliases) VALUES (?, ?)`,
        values: [
          row.name,
          JSON.stringify(row.aliases),
        ],
      })
    }
  }

  await runStatementsAtomically(db, operations)
}

async function saveAliasRowsBatch(
  db: D1DatabaseLike,
  table: AliasTableConfig,
  rows: Array<{ name: string, aliases: string[] | string }>,
) {
  const mergedRows = new Map<string, { name: string, aliases: string[] }>()

  rows.forEach((row) => {
    const name = table.normalizeName(row.name)
    if (!name) {
      return
    }

    const key = table.mergeKey(name)
    if (!key) {
      return
    }

    const aliases = table.normalizeAliases(row.aliases)
    const previous = mergedRows.get(key)
    mergedRows.set(key, {
      name: previous?.name ?? name,
      aliases: table.normalizeAliases([
        ...(previous?.aliases ?? []),
        ...aliases,
      ]),
    })
  })

  await table.ensureTable(db)
  await replaceAliasRowsAtomically(db, table, mergedRows)
}

export async function saveCreatorAliasesBatch(
  db: D1DatabaseLike,
  rows: Array<{ creatorName: string, aliases: string[] | string }>,
) {
  await saveAliasRowsBatch(db, CREATOR_ALIAS_TABLE, rows.map(row => ({ name: row.creatorName, aliases: row.aliases })))
}

export async function saveCharacterAliasesBatch(
  db: D1DatabaseLike,
  rows: Array<{ characterName: string, aliases: string[] | string }>,
) {
  await saveAliasRowsBatch(db, CHARACTER_ALIAS_TABLE, rows.map(row => ({ name: row.characterName, aliases: row.aliases })))
}

export async function saveKeywordAliasesBatch(
  db: D1DatabaseLike,
  rows: Array<{ baseKeyword: string, aliases: string[] | string }>,
) {
  await saveAliasRowsBatch(db, KEYWORD_ALIAS_TABLE, rows.map(row => ({ name: row.baseKeyword, aliases: row.aliases })))
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
