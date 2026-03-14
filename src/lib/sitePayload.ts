import type { Props } from '#data/types'
import type { CharacterNavItem } from '#lib/characters/nav'
import type { TimelineYearGroup } from '#lib/commissions/timeline'

export interface CharacterDisplay {
  DisplayName: string
}

export interface CharacterStatusPayload {
  active: CharacterDisplay[]
  stale: CharacterDisplay[]
}

export interface CreatorAliasPayload {
  creatorName: string
  aliases: string[]
}

export interface SitePayload {
  commissionData: Props
  characterStatus: CharacterStatusPayload
  creatorAliases: CreatorAliasPayload[]
  timelineGroups: TimelineYearGroup[]
  monthNavItems: CharacterNavItem[]
  activeCharacterNames: string[]
}

export function buildCommissionDataMap(commissionData: Props) {
  return new Map(commissionData.map(character => [character.Character, character] as const))
}

export function buildCreatorAliasesMap(creatorAliases: CreatorAliasPayload[]) {
  return new Map(creatorAliases.map(row => [row.creatorName, row.aliases] as const))
}
