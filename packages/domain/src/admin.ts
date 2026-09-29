import type { CharacterAliasRow, CreatorAliasRow, KeywordAliasRow } from './aliases'
import type { CharacterStatus } from './content'

export interface CharacterRow {
  id: number
  name: string
  status: CharacterStatus
  sortOrder: number
  commissionCount: number
}

export interface CommissionRow {
  id: number
  publicId: string
  characterId: number
  characterName: string
  commissionDate: string | null
  creatorName: string | null
  workGroupId: string | null
  partNumber: number | null
  fileName: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden: boolean
}

export interface AdminCommissionSearchRow {
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
  hidden: boolean
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
