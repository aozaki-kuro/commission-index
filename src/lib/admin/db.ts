import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  normalizeCharacterAliases,
  parseCharacterAliasesJson,
} from '#lib/characterAliases/shared'
import {
  normalizeAliases,
  normalizeCreatorName,
  parseAliasesJson,
} from '#lib/creatorAliases/shared'
import {
  normalizeKeywordAliasKey,
  normalizeKeywordAliases,
  normalizeKeywordBaseTerm,
  parseKeywordAliasesJson,
  splitKeywordTerms,
} from '#lib/keywordAliases/shared'
import { buildCommissionSearchMetadata } from '#lib/search/commissionSearchMetadata'
import {
  buildPopularKeywordPoolFromSuggestTexts,
  dedupeKeywords,
} from '#lib/search/popularKeywords'

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

export interface AdminCommissionSearchRow {
  id: number
  characterId: number
  characterName: string
  fileName: string
  design?: string | null
  description?: string | null
  keyword?: string | null
}

export interface CreatorAliasRow {
  creatorName: string
  aliases: string[]
  commissionCount: number
}

export interface CharacterAliasRow {
  characterName: string
  aliases: string[]
  commissionCount: number
}

export interface KeywordAliasRow {
  baseKeyword: string
  aliases: string[]
  commissionCount: number
}

export interface AdminData {
  characters: CharacterRow[]
  commissions: CommissionRow[]
}

export interface AdminBootstrapData {
  characters: CharacterRow[]
  creatorAliases: CreatorAliasRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
}

export interface HomeSuggestionAdminData {
  featuredKeywords: string[]
  keywordOptions: string[]
}

export interface AdminAliasesData {
  characterAliases: CharacterAliasRow[]
  creatorAliases: CreatorAliasRow[]
  keywordAliases: KeywordAliasRow[]
}

type BetterSqlite3Database = Database.Database

const isDevelopment = process.env.NODE_ENV !== 'production'
const databasePath = path.join(process.cwd(), 'data', 'commissions.db')

const ensureDatabaseExists = () => {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`SQLite database not found at ${databasePath}.`)
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

const hasCreatorAliasesTable = (db: BetterSqlite3Database): boolean => {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'creator_aliases' LIMIT 1",
    )
    .get() as { name?: string } | undefined

  return row?.name === 'creator_aliases'
}

const ensureCreatorAliasesTable = (db: BetterSqlite3Database) => {
  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS creator_aliases (
        creator_name TEXT PRIMARY KEY,
        aliases TEXT NOT NULL
      )
    `,
  ).run()
}

const hasCharacterAliasesTable = (db: BetterSqlite3Database): boolean => {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'character_aliases' LIMIT 1",
    )
    .get() as { name?: string } | undefined

  return row?.name === 'character_aliases'
}

const ensureCharacterAliasesTable = (db: BetterSqlite3Database) => {
  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS character_aliases (
        character_name TEXT PRIMARY KEY,
        aliases TEXT NOT NULL
      )
    `,
  ).run()
}

const hasKeywordAliasesTable = (db: BetterSqlite3Database): boolean => {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'keyword_aliases' LIMIT 1",
    )
    .get() as { name?: string } | undefined

  return row?.name === 'keyword_aliases'
}

const ensureKeywordAliasesTable = (db: BetterSqlite3Database) => {
  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS keyword_aliases (
        base_keyword TEXT PRIMARY KEY,
        aliases TEXT NOT NULL
      )
    `,
  ).run()
}

const hasHomeFeaturedSearchKeywordsTable = (db: BetterSqlite3Database): boolean => {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'home_featured_search_keywords' LIMIT 1",
    )
    .get() as { name?: string } | undefined

  return row?.name === 'home_featured_search_keywords'
}

const ensureHomeFeaturedSearchKeywordsTable = (db: BetterSqlite3Database) => {
  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS home_featured_search_keywords (
        keyword TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL
      )
    `,
  ).run()
}

const normalizeKeyword = (value?: string | null): string | null => {
  const keywords = splitKeywordTerms(value)
  if (keywords.length === 0) return null
  return normalizeKeywordAliases(keywords).join(', ')
}

type NormalizedCommissionMutation = {
  characterId: number
  fileName: string
  links: string
  design: string | null
  description: string | null
  keyword: string | null
  hidden: number
}

const normalizeCommissionMutation = (input: {
  characterId: number
  fileName: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden?: boolean
}): NormalizedCommissionMutation => ({
  characterId: input.characterId,
  fileName: input.fileName.trim(),
  links: JSON.stringify(input.links),
  design: input.design ?? null,
  description: input.description ?? null,
  keyword: normalizeKeyword(input.keyword),
  hidden: input.hidden ? 1 : 0,
})

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
    ensureCharacterAliasesTable(db)
    ensureCreatorAliasesTable(db)
    ensureKeywordAliasesTable(db)
    ensureHomeFeaturedSearchKeywordsTable(db)
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

const extractCreatorNameFromFileName = (fileName: string): string | null => {
  const separatorIndex = fileName.indexOf('_')
  if (separatorIndex < 0) return null

  return normalizeCreatorName(fileName.slice(separatorIndex + 1))
}

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

export const getAdminBootstrapData = (): AdminBootstrapData => {
  const { characters, commissionSearchRows } = withReadOnlyDatabase(db => {
    const hasKeywordColumn = hasCommissionKeywordColumn(db)
    const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword' : 'NULL as keyword'

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

    const rawCommissionSearchRows = db
      .prepare(
        `
        SELECT
          commissions.id as id,
          commissions.character_id as characterId,
          characters.name as characterName,
          commissions.file_name as fileName,
          commissions.design as design,
          commissions.description as description,
          ${keywordSelect}
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
      design?: string | null
      description?: string | null
      keyword?: string | null
    }>

    const commissionSearchRows: AdminCommissionSearchRow[] = rawCommissionSearchRows.map(row => ({
      id: row.id,
      characterId: row.characterId,
      characterName: row.characterName,
      fileName: row.fileName,
      design: row.design ?? null,
      description: row.description ?? null,
      keyword: row.keyword ?? null,
    }))

    return { characters, commissionSearchRows }
  })

  const creatorAliases = getCreatorAliasesAdminData()

  return {
    characters,
    creatorAliases,
    commissionSearchRows,
  }
}

export const getAdminCommissionsByCharacterId = (characterId: number): CommissionRow[] =>
  withReadOnlyDatabase(db => {
    const hasKeywordColumn = hasCommissionKeywordColumn(db)
    const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword,' : 'NULL as keyword,'

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
        WHERE commissions.character_id = @characterId
        ORDER BY commissions.file_name DESC
      `,
      )
      .all({
        characterId,
      }) as Array<{
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

    return rawCommissions.map(row => ({
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
  })

export const getCreatorAliasesAdminData = (): CreatorAliasRow[] =>
  withReadOnlyDatabase(db => {
    const rawFileNames = db
      .prepare('SELECT file_name as fileName FROM commissions')
      .all() as Array<{ fileName: string }>

    const creatorCounts = new Map<string, number>()
    rawFileNames.forEach(({ fileName }) => {
      const creatorName = extractCreatorNameFromFileName(fileName)
      if (!creatorName) return
      creatorCounts.set(creatorName, (creatorCounts.get(creatorName) ?? 0) + 1)
    })

    const aliasMap = new Map<string, string[]>()
    if (hasCreatorAliasesTable(db)) {
      const aliasRows = db
        .prepare(
          'SELECT creator_name as creatorName, aliases as aliasesJson FROM creator_aliases ORDER BY creator_name ASC',
        )
        .all() as Array<{ creatorName: string; aliasesJson: string }>

      aliasRows.forEach(row => {
        const normalizedCreatorName = normalizeCreatorName(row.creatorName)
        if (!normalizedCreatorName) return

        const mergedAliases = normalizeAliases([
          ...(aliasMap.get(normalizedCreatorName) ?? []),
          ...parseAliasesJson(row.aliasesJson),
        ])

        aliasMap.set(normalizedCreatorName, mergedAliases)
      })
    }

    const allCreatorNames = new Set<string>([...creatorCounts.keys(), ...aliasMap.keys()])

    return [...allCreatorNames]
      .map(creatorName => ({
        creatorName,
        aliases: aliasMap.get(creatorName) ?? [],
        commissionCount: creatorCounts.get(creatorName) ?? 0,
      }))
      .sort((a, b) => a.creatorName.localeCompare(b.creatorName, 'ja'))
  })

type KeywordCountRow = {
  keyword?: string | null
}

const getCharacterAliasesMapFromDatabase = (db: BetterSqlite3Database) => {
  const aliasesByCharacter = new Map<string, { characterName: string; aliases: string[] }>()
  if (!hasCharacterAliasesTable(db)) return aliasesByCharacter

  const aliasRows = db
    .prepare(
      'SELECT character_name as characterName, aliases as aliasesJson FROM character_aliases ORDER BY character_name ASC',
    )
    .all() as Array<{ characterName: string; aliasesJson: string }>

  aliasRows.forEach(row => {
    const characterName = normalizeCharacterAliasName(row.characterName)
    if (!characterName) return

    const key = normalizeCharacterAliasKey(characterName)
    if (!key) return

    const previous = aliasesByCharacter.get(key)
    aliasesByCharacter.set(key, {
      characterName: previous?.characterName ?? characterName,
      aliases: normalizeCharacterAliases([
        ...(previous?.aliases ?? []),
        ...parseCharacterAliasesJson(row.aliasesJson),
      ]),
    })
  })

  return aliasesByCharacter
}

export const getCharacterAliasesAdminData = (): CharacterAliasRow[] =>
  withReadOnlyDatabase(db => {
    const characterRows = db
      .prepare(
        `
          SELECT
            characters.name as characterName,
            COUNT(commissions.id) as commissionCount
          FROM characters
          LEFT JOIN commissions ON commissions.character_id = characters.id
          GROUP BY characters.id
          ORDER BY characters.sort_order ASC
        `,
      )
      .all() as Array<{ characterName: string; commissionCount: number }>

    const characterCounts = new Map<string, { characterName: string; commissionCount: number }>()
    characterRows.forEach(row => {
      const characterName = normalizeCharacterAliasName(row.characterName)
      if (!characterName) return
      const key = normalizeCharacterAliasKey(characterName)
      if (!key) return
      characterCounts.set(key, {
        characterName,
        commissionCount: Number(row.commissionCount ?? 0),
      })
    })

    const aliasMap = getCharacterAliasesMapFromDatabase(db)
    const allKeys = new Set<string>([...characterCounts.keys(), ...aliasMap.keys()])

    return [...allKeys]
      .map(key => ({
        characterName:
          aliasMap.get(key)?.characterName ?? characterCounts.get(key)?.characterName ?? '',
        aliases: aliasMap.get(key)?.aliases ?? [],
        commissionCount: characterCounts.get(key)?.commissionCount ?? 0,
      }))
      .filter(row => Boolean(row.characterName))
      .sort((a, b) => a.characterName.localeCompare(b.characterName, 'ja'))
  })

const getKeywordAliasesMapFromDatabase = (db: BetterSqlite3Database) => {
  const aliasesByKeyword = new Map<string, { baseKeyword: string; aliases: string[] }>()
  if (!hasKeywordAliasesTable(db)) return aliasesByKeyword

  const aliasRows = db
    .prepare(
      'SELECT base_keyword as baseKeyword, aliases as aliasesJson FROM keyword_aliases ORDER BY base_keyword ASC',
    )
    .all() as Array<{ baseKeyword: string; aliasesJson: string }>

  aliasRows.forEach(row => {
    const baseKeyword = normalizeKeywordBaseTerm(row.baseKeyword)
    if (!baseKeyword) return

    const key = normalizeKeywordAliasKey(baseKeyword)
    if (!key) return

    const previous = aliasesByKeyword.get(key)
    aliasesByKeyword.set(key, {
      baseKeyword: previous?.baseKeyword ?? baseKeyword,
      aliases: normalizeKeywordAliases([
        ...(previous?.aliases ?? []),
        ...parseKeywordAliasesJson(row.aliasesJson),
      ]),
    })
  })

  return aliasesByKeyword
}

export const getKeywordAliasesAdminData = (): KeywordAliasRow[] =>
  withReadOnlyDatabase(db => {
    const keywordCounts = new Map<string, { baseKeyword: string; commissionCount: number }>()

    const keywordRows = db.prepare('SELECT keyword FROM commissions').all() as KeywordCountRow[]
    keywordRows.forEach(row => {
      const uniqueTerms = new Set(splitKeywordTerms(row.keyword))
      uniqueTerms.forEach(term => {
        const key = normalizeKeywordAliasKey(term)
        if (!key) return
        const previous = keywordCounts.get(key)
        keywordCounts.set(key, {
          baseKeyword: previous?.baseKeyword ?? term,
          commissionCount: (previous?.commissionCount ?? 0) + 1,
        })
      })
    })

    const aliasMap = getKeywordAliasesMapFromDatabase(db)
    const allKeywordKeys = new Set<string>([...keywordCounts.keys(), ...aliasMap.keys()])

    return [...allKeywordKeys]
      .map(keywordKey => ({
        baseKeyword:
          aliasMap.get(keywordKey)?.baseKeyword ?? keywordCounts.get(keywordKey)?.baseKeyword ?? '',
        aliases: aliasMap.get(keywordKey)?.aliases ?? [],
        commissionCount: keywordCounts.get(keywordKey)?.commissionCount ?? 0,
      }))
      .filter(row => Boolean(row.baseKeyword))
      .sort((a, b) => a.baseKeyword.localeCompare(b.baseKeyword, 'ja'))
  })

const normalizeAliasPriorityKey = (value: string) =>
  normalizeCharacterAliasKey(value) ?? value.trim().toLowerCase()

export const getAdminAliasesData = (): AdminAliasesData => {
  const characterAliases = getCharacterAliasesAdminData()
  const creatorAliases = getCreatorAliasesAdminData()
  const keywordAliases = getKeywordAliasesAdminData()

  const usedKeys = new Set(
    characterAliases
      .map(row => normalizeAliasPriorityKey(row.characterName))
      .filter((key): key is string => Boolean(key)),
  )

  const filteredCreatorAliases = creatorAliases.filter(row => {
    const key = normalizeAliasPriorityKey(row.creatorName)
    if (!key || usedKeys.has(key)) return false
    usedKeys.add(key)
    return true
  })

  const filteredKeywordAliases = keywordAliases.filter(row => {
    const key = normalizeAliasPriorityKey(row.baseKeyword)
    if (!key || usedKeys.has(key)) return false
    usedKeys.add(key)
    return true
  })

  return {
    characterAliases,
    creatorAliases: filteredCreatorAliases,
    keywordAliases: filteredKeywordAliases,
  }
}

const MAX_FEATURED_SEARCH_KEYWORDS = 6

const getCreatorAliasesMapFromDatabase = (db: BetterSqlite3Database) => {
  const aliasesByCreator = new Map<string, string[]>()
  if (!hasCreatorAliasesTable(db)) return aliasesByCreator

  const aliasRows = db
    .prepare('SELECT creator_name as creatorName, aliases as aliasesJson FROM creator_aliases')
    .all() as Array<{ creatorName: string; aliasesJson: string }>

  aliasRows.forEach(row => {
    const creatorName = normalizeCreatorName(row.creatorName)
    if (!creatorName) return

    const mergedAliases = normalizeAliases([
      ...(aliasesByCreator.get(creatorName) ?? []),
      ...parseAliasesJson(row.aliasesJson),
    ])
    aliasesByCreator.set(creatorName, mergedAliases)
  })

  return aliasesByCreator
}

const loadPopularKeywordOptions = (db: BetterSqlite3Database) => {
  const hasKeywordColumn = hasCommissionKeywordColumn(db)
  const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword' : 'NULL as keyword'
  const commissionRows = db
    .prepare(
      `
        SELECT
          characters.name as characterName,
          commissions.file_name as fileName,
          commissions.design as design,
          commissions.description as description,
          ${keywordSelect}
        FROM commissions
        JOIN characters ON characters.id = commissions.character_id
      `,
    )
    .all() as Array<{
    characterName: string
    fileName: string
    design?: string | null
    description?: string | null
    keyword?: string | null
  }>

  const creatorAliasesMap = getCreatorAliasesMapFromDatabase(db)
  const characterAliasesMap = new Map(
    [...getCharacterAliasesMapFromDatabase(db).entries()].map(([key, row]) => [key, row.aliases]),
  )
  const keywordAliasesMap = new Map(
    [...getKeywordAliasesMapFromDatabase(db).entries()].map(([key, row]) => [key, row.aliases]),
  )
  const suggestTexts = commissionRows.map(row => {
    return buildCommissionSearchMetadata({
      characterName: row.characterName,
      fileName: row.fileName,
      design: row.design ?? null,
      description: row.description ?? null,
      keyword: row.keyword ?? null,
      characterAliasesMap,
      creatorAliasesMap,
      keywordAliasesMap,
      creatorSuggestionMode: 'normalized',
      creatorSearchTextMode: 'normalized',
    }).searchSuggestionText
  })

  return buildPopularKeywordPoolFromSuggestTexts(suggestTexts, 240)
}

const loadHomeFeaturedSearchKeywordsFromDatabase = (
  db: BetterSqlite3Database,
  limit = MAX_FEATURED_SEARCH_KEYWORDS,
) => {
  if (limit <= 0 || !hasHomeFeaturedSearchKeywordsTable(db)) {
    return []
  }

  const rows = db
    .prepare(
      `
        SELECT keyword
        FROM home_featured_search_keywords
        ORDER BY sort_order ASC
        LIMIT @limit
      `,
    )
    .all({ limit }) as Array<{ keyword: string }>

  return dedupeKeywords(
    rows.map(row => row.keyword),
    limit,
  )
}

export const getHomeFeaturedSearchKeywords = (limit = MAX_FEATURED_SEARCH_KEYWORDS): string[] =>
  withReadOnlyDatabase(db => loadHomeFeaturedSearchKeywordsFromDatabase(db, limit))

export const getHomeSuggestionAdminData = (): HomeSuggestionAdminData =>
  withReadOnlyDatabase(db => ({
    featuredKeywords: loadHomeFeaturedSearchKeywordsFromDatabase(db, MAX_FEATURED_SEARCH_KEYWORDS),
    keywordOptions: loadPopularKeywordOptions(db),
  }))

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
    const fileName = input.fileName.trim()
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
      fileName,
      links: JSON.stringify(input.links),
      design: input.design ?? null,
      description: input.description ?? null,
      keyword: normalizeKeyword(input.keyword),
      hidden: input.hidden ? 1 : 0,
    })

    return {
      characterName: characterRecord.name,
    }
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

  return withWritableDatabase(db => {
    const normalizedInput = normalizeCommissionMutation(input)
    const currentCommission = db
      .prepare(
        `
        SELECT
          character_id as characterId,
          file_name as fileName,
          links as links,
          design as design,
          description as description,
          keyword as keyword,
          hidden as hidden
        FROM commissions
        WHERE id = @id
      `,
      )
      .get({ id: input.id }) as NormalizedCommissionMutation | undefined

    if (!currentCommission) {
      throw new Error('Commission not found.')
    }

    const characterRecord = db
      .prepare('SELECT id FROM characters WHERE id = @id')
      .get({ id: input.characterId }) as { id: number } | undefined

    if (!characterRecord) {
      throw new Error('Selected character does not exist.')
    }

    normalizedInput.characterId = characterRecord.id

    const isUnchanged =
      currentCommission.characterId === normalizedInput.characterId &&
      currentCommission.fileName === normalizedInput.fileName &&
      currentCommission.links === normalizedInput.links &&
      currentCommission.design === normalizedInput.design &&
      currentCommission.description === normalizedInput.description &&
      currentCommission.keyword === normalizedInput.keyword &&
      currentCommission.hidden === normalizedInput.hidden

    if (isUnchanged) {
      return false
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
      ...normalizedInput,
    })

    return true
  })
}

export const saveCreatorAliases = (input: { creatorName: string; aliases: string[] | string }) => {
  ensureWritable()

  const creatorName = normalizeCreatorName(input.creatorName)
  if (!creatorName) {
    throw new Error('Creator name is required.')
  }

  const aliases = normalizeAliases(input.aliases)

  withWritableDatabase(db => {
    saveCreatorAliasesRowsInDatabase(db, [{ creatorName, aliases }])
  })
}

const saveCreatorAliasesRowsInDatabase = (
  db: BetterSqlite3Database,
  rows: Array<{ creatorName: string; aliases: string[] }>,
) => {
  ensureCreatorAliasesTable(db)

  const deleteStatement = db.prepare(
    'DELETE FROM creator_aliases WHERE creator_name = @creatorName',
  )
  const upsertStatement = db.prepare(
    `
      INSERT INTO creator_aliases (creator_name, aliases)
      VALUES (@creatorName, @aliases)
      ON CONFLICT(creator_name) DO UPDATE SET aliases = excluded.aliases
    `,
  )

  const transaction = db.transaction(() => {
    rows.forEach(({ creatorName, aliases }) => {
      if (aliases.length === 0) {
        deleteStatement.run({ creatorName })
        return
      }

      upsertStatement.run({
        creatorName,
        aliases: JSON.stringify(aliases),
      })
    })
  })

  transaction()
}

const saveCharacterAliasesRowsInDatabase = (
  db: BetterSqlite3Database,
  rows: Array<{ characterName: string; aliases: string[] }>,
) => {
  ensureCharacterAliasesTable(db)

  const deleteStatement = db.prepare(
    'DELETE FROM character_aliases WHERE character_name = @characterName',
  )
  const upsertStatement = db.prepare(
    `
      INSERT INTO character_aliases (character_name, aliases)
      VALUES (@characterName, @aliases)
      ON CONFLICT(character_name) DO UPDATE SET aliases = excluded.aliases
    `,
  )

  const transaction = db.transaction(() => {
    rows.forEach(({ characterName, aliases }) => {
      if (aliases.length === 0) {
        deleteStatement.run({ characterName })
        return
      }

      upsertStatement.run({
        characterName,
        aliases: JSON.stringify(aliases),
      })
    })
  })

  transaction()
}

export const saveCreatorAliasesBatch = (
  rows: Array<{ creatorName: string; aliases: string[] | string }>,
) => {
  ensureWritable()

  const mergedRows = new Map<string, string[]>()

  rows.forEach(row => {
    const creatorName = normalizeCreatorName(row.creatorName)
    if (!creatorName) return
    const aliases = normalizeAliases(row.aliases)
    mergedRows.set(
      creatorName,
      normalizeAliases([...(mergedRows.get(creatorName) ?? []), ...aliases]),
    )
  })

  const normalizedRows = [...mergedRows.entries()].map(([creatorName, aliases]) => ({
    creatorName,
    aliases,
  }))

  withWritableDatabase(db => {
    saveCreatorAliasesRowsInDatabase(db, normalizedRows)
  })
}

export const saveCharacterAliasesBatch = (
  rows: Array<{ characterName: string; aliases: string[] | string }>,
) => {
  ensureWritable()

  const mergedRows = new Map<string, { characterName: string; aliases: string[] }>()

  rows.forEach(row => {
    const characterName = normalizeCharacterAliasName(row.characterName)
    if (!characterName) return

    const key = normalizeCharacterAliasKey(characterName)
    if (!key) return

    const aliases = normalizeCharacterAliases(row.aliases)
    const previous = mergedRows.get(key)
    mergedRows.set(key, {
      characterName: previous?.characterName ?? characterName,
      aliases: normalizeCharacterAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  })

  withWritableDatabase(db => {
    saveCharacterAliasesRowsInDatabase(
      db,
      [...mergedRows.values()].map(row => ({
        characterName: row.characterName,
        aliases: row.aliases,
      })),
    )
  })
}

const saveKeywordAliasesRowsInDatabase = (
  db: BetterSqlite3Database,
  rows: Array<{ baseKeyword: string; aliases: string[] }>,
) => {
  ensureKeywordAliasesTable(db)

  const deleteStatement = db.prepare(
    'DELETE FROM keyword_aliases WHERE base_keyword = @baseKeyword',
  )
  const upsertStatement = db.prepare(
    `
      INSERT INTO keyword_aliases (base_keyword, aliases)
      VALUES (@baseKeyword, @aliases)
      ON CONFLICT(base_keyword) DO UPDATE SET aliases = excluded.aliases
    `,
  )

  const transaction = db.transaction(() => {
    rows.forEach(({ baseKeyword, aliases }) => {
      if (aliases.length === 0) {
        deleteStatement.run({ baseKeyword })
        return
      }

      upsertStatement.run({
        baseKeyword,
        aliases: JSON.stringify(aliases),
      })
    })
  })

  transaction()
}

export const saveKeywordAliasesBatch = (
  rows: Array<{ baseKeyword: string; aliases: string[] | string }>,
) => {
  ensureWritable()

  const mergedRows = new Map<string, { baseKeyword: string; aliases: string[] }>()

  rows.forEach(row => {
    const baseKeyword = normalizeKeywordBaseTerm(row.baseKeyword)
    if (!baseKeyword) return

    const key = normalizeKeywordAliasKey(baseKeyword)
    if (!key) return

    const aliases = normalizeKeywordAliases(row.aliases)
    const previous = mergedRows.get(key)

    mergedRows.set(key, {
      baseKeyword: previous?.baseKeyword ?? baseKeyword,
      aliases: normalizeKeywordAliases([...(previous?.aliases ?? []), ...aliases]),
    })
  })

  withWritableDatabase(db => {
    saveKeywordAliasesRowsInDatabase(
      db,
      [...mergedRows.values()].map(row => ({
        baseKeyword: row.baseKeyword,
        aliases: row.aliases,
      })),
    )
  })
}

export const saveHomeFeaturedSearchKeywords = (keywords: string[]) => {
  ensureWritable()

  const normalizedKeywords = dedupeKeywords(keywords, MAX_FEATURED_SEARCH_KEYWORDS)

  withWritableDatabase(db => {
    ensureHomeFeaturedSearchKeywordsTable(db)

    const clearStatement = db.prepare('DELETE FROM home_featured_search_keywords')
    const insertStatement = db.prepare(
      `
        INSERT INTO home_featured_search_keywords (keyword, sort_order)
        VALUES (@keyword, @sortOrder)
      `,
    )

    const transaction = db.transaction(() => {
      clearStatement.run()
      normalizedKeywords.forEach((keyword, index) => {
        insertStatement.run({
          keyword,
          sortOrder: index + 1,
        })
      })
    })

    transaction()
  })
}

export type { CharacterRow, CommissionRow }

export const deleteCharacter = (id: number) => {
  ensureWritable()

  return withWritableDatabase(db => {
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

  return withWritableDatabase(db => {
    const existing = db
      .prepare('SELECT file_name as fileName FROM commissions WHERE id = @id')
      .get({ id }) as { fileName: string } | undefined

    if (!existing) {
      return
    }

    db.prepare('DELETE FROM commissions WHERE id = @id').run({ id })
  })
}
