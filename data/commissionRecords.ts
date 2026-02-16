import { Commission } from '#data/types'
import { queryAll } from './sqlite'

export type CharacterStatus = 'active' | 'stale'

interface CharacterRow {
  id: number
  name: string
  status: CharacterStatus
  sort_order: number
  file_name?: string | null
  links?: string | null
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden?: number | null
}

export interface CharacterRecord {
  id: number
  name: string
  status: CharacterStatus
  sortOrder: number
  commissions: Commission[]
}

const isDevelopment = process.env.NODE_ENV === 'development'

// 将数据库中的 JSON 字符串解析为链接数组，确保异常时返回空数组
const parseLinks = (raw?: string | null): string[] => {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(link => String(link)) : []
  } catch {
    return []
  }
}

const hasCommissionKeywordColumn = (): boolean => {
  const columns = queryAll<{ name: string }>('PRAGMA table_info(commissions)')
  return columns.some(column => column.name === 'keyword')
}

// 将数据库行转换为具备排序信息的角色记录列表
const buildCharacterRecords = (rows: CharacterRow[]): CharacterRecord[] => {
  const characters = new Map<number, CharacterRecord>()

  rows.forEach(row => {
    if (!characters.has(row.id)) {
      characters.set(row.id, {
        id: row.id,
        name: row.name,
        status: row.status,
        sortOrder: row.sort_order,
        commissions: [],
      })
    }

    if (!row.file_name) return

    const record = characters.get(row.id)!
    record.commissions.push({
      fileName: row.file_name,
      Links: parseLinks(row.links),
      Design: row.design ?? undefined,
      Description: row.description ?? undefined,
      Keyword: row.keyword ?? undefined,
      Hidden: Boolean(row.hidden ?? 0),
    })
  })

  return [...characters.values()].sort((a, b) => a.sortOrder - b.sortOrder)
}

// 从 SQLite 读取角色与委托信息（开发环境实时读取，生产走缓存）
const loadCharacterRecords = (): CharacterRecord[] => {
  const hasKeywordColumn = hasCommissionKeywordColumn()
  const keywordSelect = hasKeywordColumn ? 'commissions.keyword as keyword,' : 'NULL as keyword,'

  const rows = queryAll<CharacterRow>(
    `SELECT
       characters.id,
       characters.name,
       characters.status,
       characters.sort_order,
       commissions.file_name,
       commissions.links,
       commissions.design,
       commissions.description,
       ${keywordSelect}
       commissions.hidden
     FROM characters
     LEFT JOIN commissions ON commissions.character_id = characters.id
     ORDER BY characters.sort_order ASC, commissions.file_name DESC`,
  )

  return buildCharacterRecords(rows)
}

const staticCharacterRecords = loadCharacterRecords()

export const getCharacterRecords = (): CharacterRecord[] =>
  isDevelopment ? loadCharacterRecords() : staticCharacterRecords

export { staticCharacterRecords as characterRecords }
