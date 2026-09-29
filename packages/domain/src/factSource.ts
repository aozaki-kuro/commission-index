import type {
  CharacterAliasEntry,
  CreatorAliasEntry,
  KeywordAliasEntry,
} from './aliases'
import type { CharacterRecord } from './content'

export const GENERATED_FACT_SOURCE_SCHEMA_VERSION = 3 as const
export const GENERATED_FACT_SOURCE_SOURCE = 'remote-admin-fact-source' as const

export interface GeneratedFactSourceMeta {
  schemaVersion: typeof GENERATED_FACT_SOURCE_SCHEMA_VERSION
  source: typeof GENERATED_FACT_SOURCE_SOURCE
  exportedAt: string
  revision: string
  databaseBinding: string
  imagesBucket: string
}

export interface GeneratedFactSourceContent {
  meta: GeneratedFactSourceMeta
  characters: CharacterRecord[]
  creatorAliases: CreatorAliasEntry[]
  characterAliases: CharacterAliasEntry[]
  keywordAliases: KeywordAliasEntry[]
  featuredSearchKeywords: string[]
}

export interface GeneratedSourceImageManifestFile {
  /** D1 内部关联键；不用于公开页面身份。 */
  commissionId: number
  commissionFileName: string
  objectKey: string
  relativePath: string
  mimeType: string
  byteSize: number | null
  sha256: string
}

export interface GeneratedSourceImageManifestMissing {
  commissionId: number
  commissionFileName: string
  candidateObjectKeys: string[]
  reason: 'not_found' | 'download_failed'
  message?: string
}

export interface GeneratedSourceImageManifest {
  meta: GeneratedFactSourceMeta
  files: GeneratedSourceImageManifestFile[]
  missing: GeneratedSourceImageManifestMissing[]
}
