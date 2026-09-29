export interface Commission {
  id: number
  publicId: string
  commissionDate: string | null
  creatorName: string | null
  /** 仅用于兼容旧预览的历史分组；新作品使用 workGroupId 描述关联。 */
  seriesKey?: string | null
  /** 仅用于兼容旧预览的历史排序值；由导出器从旧文件名派生。 */
  seriesOrder?: string | null
  /** 作品组身份；组内每个 part 仍是独立作品记录。 */
  workGroupId: string | null
  /** 作品在组内的编号；普通作品与未编号作品为 null。 */
  partNumber: number | null
  /** 导出器标注的旧 preview；新数据不设置该兼容标记。 */
  legacySeriesKind?: 'preview' | null
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
