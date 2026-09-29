import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { splitKeywordTerms } from '@commission-index/domain'
import { getCommissionDisplayLabel } from './commissionPresentation'

export interface DuplicateCommissionHint {
  commissionId: number
  characterId: number
  characterName: string
  commissionDate: string | null
  creatorName: string | null
  displayLabel: string
  reasons: string[]
  score: number
}

interface FindDuplicateCommissionHintsInput {
  commissionId?: number
  characterId: number | null
  commissionDate: string | null
  creatorName: string
  keyword?: string
  commissions: AdminCommissionSearchRow[]
  limit?: number
}

function normalizeCreatorName(value?: string | null) {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function getKeywordSet(value?: string | null) {
  return new Set(splitKeywordTerms(value))
}

function getSharedKeywords(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return []
  }

  const shared: string[] = []
  for (const keyword of left) {
    if (right.has(keyword)) {
      shared.push(keyword)
    }
  }

  return shared.toSorted((a, b) => a.localeCompare(b))
}

export function findDuplicateCommissionHints({
  commissionId,
  characterId,
  commissionDate,
  creatorName,
  keyword,
  commissions,
  limit = 4,
}: FindDuplicateCommissionHintsInput): DuplicateCommissionHint[] {
  const normalizedCreatorName = normalizeCreatorName(creatorName)
  const hasCharacterSelection = typeof characterId === 'number' && characterId > 0
  const queryKeywords = getKeywordSet(keyword)

  // 日期或作者不全时只能证明“同一天”，不能据此判断作品重复。
  if (!hasCharacterSelection || !commissionDate || !normalizedCreatorName) {
    return []
  }

  return commissions
    .filter(candidate => candidate.id !== commissionId)
    .flatMap((candidate) => {
      const sameCommissionDetails
        = candidate.characterId === characterId
          && candidate.commissionDate === commissionDate
          && normalizeCreatorName(candidate.creatorName) === normalizedCreatorName

      if (!sameCommissionDetails) {
        return []
      }

      const reasons = [
        'Same character',
        `Same date ${commissionDate}`,
        'Same creator',
      ]
      let score = 150
      const sharedKeywords = getSharedKeywords(queryKeywords, getKeywordSet(candidate.keyword))
      if (sharedKeywords.length > 0) {
        score += Math.min(20, sharedKeywords.length * 10)
        reasons.push(`Shared keyword: ${sharedKeywords.slice(0, 2).join(', ')}`)
      }

      return [{
        characterId: candidate.characterId,
        characterName: candidate.characterName,
        commissionDate: candidate.commissionDate,
        creatorName: candidate.creatorName,
        commissionId: candidate.id,
        displayLabel: getCommissionDisplayLabel(candidate),
        reasons,
        score,
      } satisfies DuplicateCommissionHint]
    })
    .toSorted((left, right) => right.score - left.score || right.commissionId - left.commissionId)
    .slice(0, limit)
}
