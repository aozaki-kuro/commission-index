export interface Commission {
  id: number
  commissionDate: string | null
  creatorName: string | null
  /** 历史预览/part 聚合身份；新作品省略时保持独立。 */
  seriesKey?: string | null
  /** 历史预览/part 的兼容排序值；仅由导出器从旧文件名派生。 */
  seriesOrder?: string | null
  fileName: string
  Links: string[]
  Design?: string
  Description?: string
  Keyword?: string
  Hidden?: boolean
}

export interface CharacterCommissions {
  Character: string
  Commissions: Commission[]
}

export type CommissionCollection = CharacterCommissions[]
export type Props = CommissionCollection

export type CharacterStatus = 'active' | 'archived'

export interface CharacterRecord {
  id: number
  name: string
  status: CharacterStatus
  sortOrder: number
  commissions: Commission[]
}
