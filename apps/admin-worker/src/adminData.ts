import type {
  AdminAliasesData,
  AdminBootstrapData,
  AdminCommissionSearchRow,
  CharacterAliasRow,
  CharacterRow,
  CommissionRow,
  CreatorAliasRow,
  HomeSuggestionAdminData,
  KeywordAliasRow,
  SuggestionRows,
  SuggestionSource,
} from '../../../packages/domain/src/index'
import type { D1DatabaseLike } from './adminPersistence'
import {
  buildCommissionSearchMetadata,
  normalizeAliases,
  normalizeCharacterAliases,
  normalizeCharacterAliasKey,
  normalizeCharacterAliasName,
  normalizeCreatorName,
  normalizeKeywordAliases,
  normalizeKeywordAliasKey,
  normalizeKeywordBaseTerm,
  parseAliasesJson,
  parseCharacterAliasesJson,
  parseKeywordAliasesJson,
  splitKeywordTerms,
} from '../../../packages/domain/src/index'

interface ApiState {
  status: 'success' | 'error'
  message: string
}

interface TableInfoRow {
  name?: string | null
}

interface CharacterCountRow {
  id: number
  name: string
  status: 'active' | 'archived'
  sortOrder: number
  commissionCount: number
}

interface BootstrapCommissionRow {
  id: number
  publicId: string
  characterId: number
  characterName: string
  commissionDate: string | null
  creatorName: string | null
  workGroupId: string | null
  partNumber: number | null
  fileName: string
  links: string
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden: number
}

interface CommissionDetailRow extends BootstrapCommissionRow {
  links: string
  hidden: number
}

interface SourceImageObjectKeyRow {
  objectKey: string | null
}

interface SourceImageByCommissionIdRow extends SourceImageObjectKeyRow {
  fileName: string
}

interface AliasJsonRow {
  aliasesJson: string
}

interface CreatorAliasJsonRow extends AliasJsonRow {
  creatorName: string
}

interface CharacterAliasJsonRow extends AliasJsonRow {
  characterName: string
}

interface KeywordAliasJsonRow extends AliasJsonRow {
  baseKeyword: string
}

interface KeywordCountRow {
  keyword?: string | null
}

interface SuggestionCommissionRow {
  characterName: string
  commissionDate: string | null
  creatorName: string | null
  fileName: string
  design?: string | null
  description?: string | null
  keyword?: string | null
}

interface FeaturedKeywordRow {
  keyword: string
}

interface R2HttpMetadataLike {
  contentType?: string | null
}

interface R2ObjectBodyLike {
  arrayBuffer: () => Promise<ArrayBuffer>
  // Streaming and revalidation metadata mirror the Cloudflare R2ObjectBody surface;
  // optional here so existing metadata-only test fakes stay valid.
  body?: ReadableStream | null
  size?: number
  httpEtag?: string
  httpMetadata?: R2HttpMetadataLike
}

export interface R2BucketLike {
  get: (key: string) => Promise<R2ObjectBodyLike | null>
}

const CHARACTER_COMMISSIONS_PATH_PATTERN = /^\/api\/admin\/characters\/\d+\/commissions$/
const CHARACTER_COMMISSIONS_ID_PATTERN = /^\/api\/admin\/characters\/(\d+)\/commissions$/
const SOURCE_IMAGE_FILE_NAME_PATTERN = /^\d{8}(?:_.+)?$/
const SOURCE_IMAGE_FORBIDDEN_PATTERN = /[<>:"/\\|?*]/
const SOURCE_IMAGE_SUFFIX_PATTERN = /\s*\((preview|part).*?\)$/i
const NORMALIZE_SPACES_PATTERN = /\s+/g
const MAX_FEATURED_SEARCH_KEYWORDS = 6
const MAX_POPULAR_KEYWORDS = 240

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function failure(message: string, status = 400) {
  return json({
    status: 'error',
    message,
  } satisfies ApiState, status)
}

function missingDbBinding() {
  return failure('Admin worker DB binding is required for this route.', 503)
}

function missingImagesBinding() {
  return failure('Admin worker IMAGES binding is required for this route.', 503)
}

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function parseIdFromPath(pathname: string, pattern: RegExp) {
  const match = pathname.match(pattern)
  if (!match) {
    return null
  }

  const id = Number(match[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

function parseLinks(raw?: string | null): string[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(link => String(link)) : []
  }
  catch {
    return []
  }
}

function normalizeKeyword(value: string) {
  return value.trim().replace(NORMALIZE_SPACES_PATTERN, ' ')
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

function normalizeSuggestionSource(rawSource: string): SuggestionSource {
  if (
    rawSource === 'Character'
    || rawSource === 'Creator'
    || rawSource === 'Keyword'
    || rawSource === 'Date'
  ) {
    return rawSource
  }

  return 'Keyword'
}

function normalizeSuggestionTerm(term: string) {
  return term.replace(SOURCE_IMAGE_SUFFIX_PATTERN, '').trim()
}

function parseSuggestionRows(suggestText: string): SuggestionRows {
  const rows = new Map<string, { source: SuggestionSource, term: string }>()

  for (const rawRow of suggestText.split('\n')) {
    const row = rawRow.trim()
    if (!row) {
      continue
    }

    const [rawSource = 'Keyword', ...rest] = row.split('\t')
    const term = normalizeSuggestionTerm(rest.join('\t').trim())
    const normalizedTerm = term.toLowerCase()
    if (!normalizedTerm || rows.has(normalizedTerm)) {
      continue
    }

    rows.set(normalizedTerm, {
      source: normalizeSuggestionSource(rawSource),
      term: term || normalizedTerm,
    })
  }

  return rows
}

function buildPopularKeywordPoolFromSuggestTexts(
  suggestTexts: Iterable<string>,
  maxKeywords = MAX_POPULAR_KEYWORDS,
) {
  const termStats = new Map<string, { term: string, count: number }>()

  for (const suggestText of suggestTexts) {
    const parsedRows = parseSuggestionRows(suggestText)
    let hasPrimaryCreatorInEntry = false

    for (const { source, term } of parsedRows.values()) {
      if (source === 'Date') {
        continue
      }

      if (source === 'Creator' && hasPrimaryCreatorInEntry) {
        continue
      }

      const normalizedTerm = source === 'Creator'
        ? (normalizeCreatorName(term) ?? term.trim())
        : term.trim()

      if (!normalizedTerm) {
        continue
      }

      const key = normalizedTerm.toLowerCase()
      const previous = termStats.get(key)
      if (previous) {
        previous.count += 1
      }
      else {
        termStats.set(key, {
          term: normalizedTerm,
          count: 1,
        })
      }

      if (source === 'Creator') {
        hasPrimaryCreatorInEntry = true
      }
    }
  }

  return [...termStats.values()]
    .toSorted((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count
      }

      return left.term.localeCompare(right.term)
    })
    .slice(0, maxKeywords)
    .map(item => item.term)
}

function resolveD1Database(value: unknown): D1DatabaseLike | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { prepare?: unknown }
  if (typeof candidate.prepare !== 'function') {
    return null
  }

  return value as D1DatabaseLike
}

function resolveImagesBucket(value: unknown): R2BucketLike | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { get?: unknown }
  if (typeof candidate.get !== 'function') {
    return null
  }

  return value as R2BucketLike
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

async function hasTable(db: D1DatabaseLike, tableName: string) {
  const rows = await queryRows<TableInfoRow>(
    db,
    'SELECT name FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1',
    ['table', tableName],
  )

  return rows[0]?.name === tableName
}

async function hasCommissionKeywordColumn(db: D1DatabaseLike) {
  const rows = await queryRows<TableInfoRow>(db, 'PRAGMA table_info(commissions)')
  return rows.some(row => row.name === 'keyword')
}

async function loadCharacters(db: D1DatabaseLike): Promise<CharacterRow[]> {
  const rows = await queryRows<CharacterCountRow>(
    db,
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

  return rows.map(row => ({
    id: Number(row.id),
    name: row.name,
    status: row.status,
    sortOrder: Number(row.sortOrder),
    commissionCount: Number(row.commissionCount ?? 0),
  }))
}

async function loadCreatorAliasesAdminDataFromDatabase(db: D1DatabaseLike): Promise<CreatorAliasRow[]> {
  const rawCreatorNames = await queryRows<{ creatorName: string | null }>(
    db,
    'SELECT creator_name as creatorName FROM commissions WHERE creator_name IS NOT NULL',
  )

  const creatorCounts = new Map<string, number>()
  rawCreatorNames.forEach(({ creatorName: rawCreatorName }) => {
    const creatorName = normalizeCreatorName(rawCreatorName ?? '')
    if (!creatorName) {
      return
    }

    creatorCounts.set(creatorName, (creatorCounts.get(creatorName) ?? 0) + 1)
  })

  const aliasMap = new Map<string, string[]>()
  if (await hasTable(db, 'creator_aliases')) {
    const aliasRows = await queryRows<CreatorAliasJsonRow>(
      db,
      `
        SELECT
          creator_name as creatorName,
          aliases as aliasesJson
        FROM creator_aliases
        ORDER BY creator_name ASC
      `,
    )

    aliasRows.forEach((row) => {
      const creatorName = normalizeCreatorName(row.creatorName)
      if (!creatorName) {
        return
      }

      const mergedAliases = normalizeAliases([
        ...(aliasMap.get(creatorName) ?? []),
        ...parseAliasesJson(row.aliasesJson),
      ])

      aliasMap.set(creatorName, mergedAliases)
    })
  }

  const allCreatorNames = new Set<string>([...creatorCounts.keys(), ...aliasMap.keys()])

  return Array.from(allCreatorNames, creatorName => ({
    creatorName,
    aliases: aliasMap.get(creatorName) ?? [],
    commissionCount: creatorCounts.get(creatorName) ?? 0,
  }))
    .sort((left, right) => left.creatorName.localeCompare(right.creatorName, 'ja'))
}

async function getCharacterAliasesMapFromDatabase(db: D1DatabaseLike) {
  const aliasesByCharacter = new Map<string, { characterName: string, aliases: string[] }>()
  if (!(await hasTable(db, 'character_aliases'))) {
    return aliasesByCharacter
  }

  const aliasRows = await queryRows<CharacterAliasJsonRow>(
    db,
    `
      SELECT
        character_name as characterName,
        aliases as aliasesJson
      FROM character_aliases
      ORDER BY character_name ASC
    `,
  )

  aliasRows.forEach((row) => {
    const characterName = normalizeCharacterAliasName(row.characterName)
    if (!characterName) {
      return
    }

    const key = normalizeCharacterAliasKey(characterName)
    if (!key) {
      return
    }

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

async function loadCharacterAliasesAdminDataFromDatabase(db: D1DatabaseLike): Promise<CharacterAliasRow[]> {
  const characterRows = await queryRows<{
    characterName: string
    commissionCount: number
  }>(
    db,
    `
      SELECT
        characters.name as characterName,
        commissions.commission_date as commissionDate,
        commissions.creator_name as creatorName,
        COUNT(commissions.id) as commissionCount
      FROM characters
      LEFT JOIN commissions ON commissions.character_id = characters.id
      GROUP BY characters.id
      ORDER BY characters.sort_order ASC
    `,
  )

  const characterCounts = new Map<string, { characterName: string, commissionCount: number }>()
  characterRows.forEach((row) => {
    const characterName = normalizeCharacterAliasName(row.characterName)
    if (!characterName) {
      return
    }

    const key = normalizeCharacterAliasKey(characterName)
    if (!key) {
      return
    }

    characterCounts.set(key, {
      characterName,
      commissionCount: Number(row.commissionCount ?? 0),
    })
  })

  const aliasMap = await getCharacterAliasesMapFromDatabase(db)
  const allKeys = new Set<string>([...characterCounts.keys(), ...aliasMap.keys()])

  return Array.from(allKeys, key => ({
    characterName:
      aliasMap.get(key)?.characterName ?? characterCounts.get(key)?.characterName ?? '',
    aliases: aliasMap.get(key)?.aliases ?? [],
    commissionCount: characterCounts.get(key)?.commissionCount ?? 0,
  }))
    .filter(row => Boolean(row.characterName))
    .sort((left, right) => left.characterName.localeCompare(right.characterName, 'ja'))
}

async function getKeywordAliasesMapFromDatabase(db: D1DatabaseLike) {
  const aliasesByKeyword = new Map<string, { baseKeyword: string, aliases: string[] }>()
  if (!(await hasTable(db, 'keyword_aliases'))) {
    return aliasesByKeyword
  }

  const aliasRows = await queryRows<KeywordAliasJsonRow>(
    db,
    `
      SELECT
        base_keyword as baseKeyword,
        aliases as aliasesJson
      FROM keyword_aliases
      ORDER BY base_keyword ASC
    `,
  )

  aliasRows.forEach((row) => {
    const baseKeyword = normalizeKeywordBaseTerm(row.baseKeyword)
    if (!baseKeyword) {
      return
    }

    const key = normalizeKeywordAliasKey(baseKeyword)
    if (!key) {
      return
    }

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

async function loadKeywordAliasesAdminDataFromDatabase(db: D1DatabaseLike): Promise<KeywordAliasRow[]> {
  const keywordCounts = new Map<string, { baseKeyword: string, commissionCount: number }>()

  if (await hasCommissionKeywordColumn(db)) {
    const keywordRows = await queryRows<KeywordCountRow>(
      db,
      'SELECT keyword FROM commissions',
    )

    keywordRows.forEach((row) => {
      const uniqueTerms = new Set(splitKeywordTerms(row.keyword))
      uniqueTerms.forEach((term) => {
        const key = normalizeKeywordAliasKey(term)
        if (!key) {
          return
        }

        const previous = keywordCounts.get(key)
        keywordCounts.set(key, {
          baseKeyword: previous?.baseKeyword ?? term,
          commissionCount: (previous?.commissionCount ?? 0) + 1,
        })
      })
    })
  }

  const aliasMap = await getKeywordAliasesMapFromDatabase(db)
  const allKeys = new Set<string>([...keywordCounts.keys(), ...aliasMap.keys()])

  return Array.from(allKeys, keywordKey => ({
    baseKeyword:
      aliasMap.get(keywordKey)?.baseKeyword ?? keywordCounts.get(keywordKey)?.baseKeyword ?? '',
    aliases: aliasMap.get(keywordKey)?.aliases ?? [],
    commissionCount: keywordCounts.get(keywordKey)?.commissionCount ?? 0,
  }))
    .filter(row => Boolean(row.baseKeyword))
    .sort((left, right) => left.baseKeyword.localeCompare(right.baseKeyword, 'ja'))
}

function normalizeAliasPriorityKey(value: string) {
  return normalizeCharacterAliasKey(value) ?? value.trim().toLowerCase()
}

async function loadAdminBootstrapData(db: D1DatabaseLike): Promise<AdminBootstrapData> {
  const characters = await loadCharacters(db)
  const hasKeywordColumn = await hasCommissionKeywordColumn(db)
  const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword' : 'NULL as keyword'
  const rawRows = await queryRows<BootstrapCommissionRow>(
    db,
    `
      SELECT
        commissions.id as id,
        commissions.public_id as publicId,
        commissions.character_id as characterId,
        characters.name as characterName,
        commissions.commission_date as commissionDate,
        commissions.creator_name as creatorName,
        commissions.work_group_id as workGroupId,
        commissions.part_number as partNumber,
        commissions.file_name as fileName,
        commissions.links as links,
        commissions.design as design,
        commissions.description as description,
        ${keywordSelect},
        commissions.hidden as hidden
      FROM commissions
      JOIN characters ON characters.id = commissions.character_id
      ORDER BY characters.sort_order ASC, commissions.commission_date DESC, commissions.id DESC
    `,
  )

  const commissionSearchRows: AdminCommissionSearchRow[] = rawRows.map(row => ({
    id: Number(row.id),
    publicId: row.publicId,
    characterId: Number(row.characterId),
    characterName: row.characterName,
    commissionDate: row.commissionDate ?? null,
    creatorName: row.creatorName ?? null,
    workGroupId: row.workGroupId ?? null,
    partNumber: row.partNumber == null ? null : Number(row.partNumber),
    fileName: row.fileName,
    links: row.links ?? '',
    design: row.design ?? null,
    description: row.description ?? null,
    keyword: row.keyword ?? null,
    hidden: Boolean(row.hidden),
  }))

  return {
    characters,
    creatorAliases: await loadCreatorAliasesAdminDataFromDatabase(db),
    commissionSearchRows,
  }
}

async function loadAdminAliasesData(db: D1DatabaseLike): Promise<AdminAliasesData> {
  const characterAliases = await loadCharacterAliasesAdminDataFromDatabase(db)
  const creatorAliases = await loadCreatorAliasesAdminDataFromDatabase(db)
  const keywordAliases = await loadKeywordAliasesAdminDataFromDatabase(db)
  const usedKeys = new Set(
    characterAliases
      .map(row => normalizeAliasPriorityKey(row.characterName))
      .filter((key): key is string => Boolean(key)),
  )

  const filteredCreatorAliases = creatorAliases.filter((row) => {
    const key = normalizeAliasPriorityKey(row.creatorName)
    if (!key || usedKeys.has(key)) {
      return false
    }

    usedKeys.add(key)
    return true
  })

  const filteredKeywordAliases = keywordAliases.filter((row) => {
    const key = normalizeAliasPriorityKey(row.baseKeyword)
    if (!key || usedKeys.has(key)) {
      return false
    }

    usedKeys.add(key)
    return true
  })

  return {
    characterAliases,
    creatorAliases: filteredCreatorAliases,
    keywordAliases: filteredKeywordAliases,
  }
}

async function loadHomeFeaturedSearchKeywordsFromDatabase(
  db: D1DatabaseLike,
  limit = MAX_FEATURED_SEARCH_KEYWORDS,
) {
  if (limit <= 0 || !(await hasTable(db, 'home_featured_search_keywords'))) {
    return []
  }

  const rows = await queryRows<FeaturedKeywordRow>(
    db,
    `
      SELECT keyword
      FROM home_featured_search_keywords
      ORDER BY sort_order ASC
      LIMIT ?
    `,
    [limit],
  )

  return dedupeKeywords(
    rows.map(row => row.keyword),
    limit,
  )
}

async function getCreatorAliasesMapFromDatabase(db: D1DatabaseLike) {
  const aliasesByCreator = new Map<string, string[]>()
  if (!(await hasTable(db, 'creator_aliases'))) {
    return aliasesByCreator
  }

  const aliasRows = await queryRows<CreatorAliasJsonRow>(
    db,
    `
      SELECT
        creator_name as creatorName,
        aliases as aliasesJson
      FROM creator_aliases
    `,
  )

  aliasRows.forEach((row) => {
    const creatorName = normalizeCreatorName(row.creatorName)
    if (!creatorName) {
      return
    }

    const mergedAliases = normalizeAliases([
      ...(aliasesByCreator.get(creatorName) ?? []),
      ...parseAliasesJson(row.aliasesJson),
    ])

    aliasesByCreator.set(creatorName, mergedAliases)
  })

  return aliasesByCreator
}

async function loadPopularKeywordOptions(db: D1DatabaseLike) {
  const hasKeywordColumn = await hasCommissionKeywordColumn(db)
  const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword' : 'NULL as keyword'
  const commissionRows = await queryRows<SuggestionCommissionRow>(
    db,
    `
      SELECT
        characters.name as characterName,
        commissions.commission_date as commissionDate,
        commissions.creator_name as creatorName,
        commissions.file_name as fileName,
        commissions.design as design,
        commissions.description as description,
        ${keywordSelect}
      FROM commissions
      JOIN characters ON characters.id = commissions.character_id
    `,
  )

  const creatorAliasesMap = await getCreatorAliasesMapFromDatabase(db)
  const characterAliasesMap = new Map(
    Array.from((await getCharacterAliasesMapFromDatabase(db)).entries(), ([key, row]) => [key, row.aliases]),
  )
  const keywordAliasesMap = new Map(
    Array.from((await getKeywordAliasesMapFromDatabase(db)).entries(), ([key, row]) => [key, row.aliases]),
  )

  const suggestTexts = commissionRows.map(row => (
    buildCommissionSearchMetadata({
      characterName: row.characterName,
      commissionDate: row.commissionDate,
      creatorName: row.creatorName,
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
  ))

  return buildPopularKeywordPoolFromSuggestTexts(suggestTexts, MAX_POPULAR_KEYWORDS)
}

async function loadHomeSuggestionAdminData(db: D1DatabaseLike): Promise<HomeSuggestionAdminData> {
  return {
    featuredKeywords: await loadHomeFeaturedSearchKeywordsFromDatabase(db, MAX_FEATURED_SEARCH_KEYWORDS),
    keywordOptions: await loadPopularKeywordOptions(db),
  }
}

async function loadCharacterCommissions(
  db: D1DatabaseLike,
  characterId: number,
): Promise<CommissionRow[]> {
  const hasKeywordColumn = await hasCommissionKeywordColumn(db)
  const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword,' : 'NULL as keyword,'
  const rows = await queryRows<CommissionDetailRow>(
    db,
    `
      SELECT
        commissions.id as id,
        commissions.public_id as publicId,
        commissions.character_id as characterId,
        characters.name as characterName,
        commissions.commission_date as commissionDate,
        commissions.creator_name as creatorName,
        commissions.work_group_id as workGroupId,
        commissions.part_number as partNumber,
        commissions.file_name as fileName,
        commissions.links as links,
        commissions.design as design,
        commissions.description as description,
        ${keywordSelect}
        commissions.hidden as hidden
      FROM commissions
      JOIN characters ON characters.id = commissions.character_id
      WHERE commissions.character_id = ?
      ORDER BY commissions.commission_date DESC, commissions.id DESC
    `,
    [characterId],
  )

  return rows.map(row => ({
    id: Number(row.id),
    publicId: row.publicId,
    characterId: Number(row.characterId),
    characterName: row.characterName,
    commissionDate: row.commissionDate ?? null,
    creatorName: row.creatorName ?? null,
    workGroupId: row.workGroupId ?? null,
    partNumber: row.partNumber == null ? null : Number(row.partNumber),
    fileName: row.fileName,
    links: parseLinks(row.links),
    design: row.design ?? null,
    description: row.description ?? null,
    keyword: row.keyword ?? null,
    hidden: Boolean(row.hidden),
  }))
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1F) {
      return true
    }
  }

  return false
}

function validateSourceImageFileName(rawValue: string) {
  const fileName = rawValue.trim()
  if (!fileName) {
    return 'File name is required.'
  }

  if (!SOURCE_IMAGE_FILE_NAME_PATTERN.test(fileName)) {
    return 'File name must start with YYYYMMDD, optionally followed by "_creator".'
  }

  if (
    SOURCE_IMAGE_FORBIDDEN_PATTERN.test(fileName)
    || fileName.includes('..')
    || hasControlCharacter(fileName)
  ) {
    return 'File name contains forbidden path characters.'
  }

  return null
}

function getSourceImageMimeType(key: string, object: R2ObjectBodyLike) {
  const contentType = object.httpMetadata?.contentType?.trim()
  if (contentType) {
    return contentType
  }

  const lowerKey = key.toLowerCase()
  if (lowerKey.endsWith('.png')) {
    return 'image/png'
  }

  return 'image/jpeg'
}

async function loadSourceImageResponse(
  bucket: R2BucketLike,
  rawFileName: string,
  db?: D1DatabaseLike | null,
) {
  const validationError = validateSourceImageFileName(rawFileName)
  if (validationError) {
    return failure(validationError)
  }

  const fileName = rawFileName.trim()
  const preferredKeys: string[] = []
  if (db && await hasTable(db, 'source_images')) {
    const row = await queryFirstRow<SourceImageObjectKeyRow>(
      db,
      'SELECT object_key as objectKey FROM source_images WHERE commission_file_name = ? LIMIT 1',
      [fileName],
    )
    if (row?.objectKey) {
      preferredKeys.push(row.objectKey)
    }
  }
  const candidateKeys = [
    ...preferredKeys,
    ...[`${fileName}.jpg`, `${fileName}.jpeg`, `${fileName}.png`].filter(
      key => !preferredKeys.includes(key),
    ),
  ]

  for (const key of candidateKeys) {
    const object = await bucket.get(key)
    if (!object) {
      continue
    }

    const imageBuffer = await object.arrayBuffer()
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': getSourceImageMimeType(key, object),
        'Cache-Control': 'no-store',
      },
    })
  }

  return notFound()
}

async function loadCommissionSourceImageResponse(
  bucket: R2BucketLike,
  db: D1DatabaseLike | null,
  commissionId: number,
  requestHeaders: Headers,
) {
  if (!db) {
    return missingDbBinding()
  }
  // Resolve the object key by commission id first, then fall back to the legacy filename
  // relationship. The OR join previously had undefined priority when an id-mapped row and a
  // filename row with a NULL commission_id both matched; COALESCE pins id-first precedence.
  const source = await queryFirstRow<SourceImageByCommissionIdRow>(
    db,
    `
      SELECT
        c.file_name AS fileName,
        COALESCE(
          (SELECT object_key FROM source_images WHERE commission_id = c.id LIMIT 1),
          (SELECT object_key FROM source_images WHERE commission_file_name = c.file_name LIMIT 1)
        ) AS objectKey
      FROM commissions c
      WHERE c.id = ?
    `,
    [commissionId],
  )
  if (!source?.fileName) {
    return notFound()
  }

  const keys = [source.objectKey, `${source.fileName}.jpg`, `${source.fileName}.jpeg`, `${source.fileName}.png`]
    .filter((key): key is string => Boolean(key))
  for (const key of keys) {
    const object = await bucket.get(key)
    if (!object) {
      continue
    }

    const headers = new Headers({
      'Content-Type': getSourceImageMimeType(key, object),
      // Browser may cache the bytes but must revalidate, so a replaced image is never stale.
      'Cache-Control': 'private, no-cache',
    })
    if (object.httpEtag) {
      headers.set('ETag', object.httpEtag)
    }
    if (object.httpEtag && matchesIfNoneMatch(requestHeaders.get('If-None-Match'), object.httpEtag)) {
      // Release the fetched body; the client reuses its cached copy.
      await object.body?.cancel()
      return new Response(null, { status: 304, headers })
    }
    if (object.size !== undefined) {
      headers.set('Content-Length', String(object.size))
    }
    return new Response(object.body ?? await object.arrayBuffer(), { status: 200, headers })
  }
  return notFound()
}

function matchesIfNoneMatch(headerValue: string | null, etag: string) {
  if (!headerValue) {
    return false
  }
  return headerValue
    .split(',')
    .some(value => value.trim() === '*' || value.trim() === etag)
}

export interface AdminReadEnv {
  DB?: unknown
  IMAGES?: unknown
}

export async function handleAdminReadRequest(request: Request, env: AdminReadEnv) {
  if (request.method !== 'GET') {
    return null
  }

  const { pathname } = new URL(request.url)
  const db = resolveD1Database(env.DB)

  const commissionImageMatch = pathname.match(/^\/api\/admin\/commissions\/(\d+)\/source-image$/)
  if (commissionImageMatch) {
    const bucket = resolveImagesBucket(env.IMAGES)
    if (!bucket) {
      return missingImagesBinding()
    }
    const commissionId = Number(commissionImageMatch[1])
    if (!Number.isSafeInteger(commissionId) || commissionId <= 0) {
      return failure('Invalid commission identifier.')
    }
    try {
      return await loadCommissionSourceImageResponse(bucket, db, commissionId, request.headers)
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to load source image.', 500)
    }
  }

  if (pathname === '/api/admin/bootstrap') {
    if (!db) {
      return missingDbBinding()
    }

    try {
      return json(await loadAdminBootstrapData(db))
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to load admin bootstrap data.', 500)
    }
  }

  if (pathname === '/api/admin/aliases/bootstrap') {
    if (!db) {
      return missingDbBinding()
    }

    try {
      return json(await loadAdminAliasesData(db))
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to load admin aliases data.', 500)
    }
  }

  if (pathname === '/api/admin/suggestion') {
    if (!db) {
      return missingDbBinding()
    }

    try {
      return json(await loadHomeSuggestionAdminData(db))
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to load suggestion data.', 500)
    }
  }

  if (CHARACTER_COMMISSIONS_PATH_PATTERN.test(pathname)) {
    if (!db) {
      return missingDbBinding()
    }

    const characterId = parseIdFromPath(pathname, CHARACTER_COMMISSIONS_ID_PATTERN)
    if (!characterId) {
      return failure('Invalid character identifier.')
    }

    try {
      return json({
        commissions: await loadCharacterCommissions(db, characterId),
      })
    }
    catch (error) {
      return failure(error instanceof Error ? error.message : 'Failed to load commissions.', 500)
    }
  }

  if (pathname.startsWith('/api/admin/source-image/')) {
    const bucket = resolveImagesBucket(env.IMAGES)
    if (!bucket) {
      return missingImagesBinding()
    }

    const encodedFileName = pathname.slice('/api/admin/source-image/'.length)
    if (!encodedFileName) {
      return failure('File name is required.')
    }

    try {
      const fileName = decodeURIComponent(encodedFileName)
      return await loadSourceImageResponse(bucket, fileName, db)
    }
    catch (error) {
      if (error instanceof URIError) {
        return failure('Invalid file name.')
      }

      return failure(error instanceof Error ? error.message : 'Failed to load source image.', 500)
    }
  }

  return null
}
