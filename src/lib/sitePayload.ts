import type { Props } from '#data/types'
import type { CharacterNavItem } from '#lib/characters/nav'
import type { TimelineYearGroup } from '#lib/commissions/timeline'

export type CharacterDisplay = {
  DisplayName: string
}

export type CharacterStatusPayload = {
  active: CharacterDisplay[]
  stale: CharacterDisplay[]
}

export type CreatorAliasPayload = {
  creatorName: string
  aliases: string[]
}

export type SitePayload = {
  commissionData: Props
  characterStatus: CharacterStatusPayload
  creatorAliases: CreatorAliasPayload[]
  timelineGroups: TimelineYearGroup[]
  monthNavItems: CharacterNavItem[]
  activeCharacterNames: string[]
}

export const buildCommissionDataMap = (commissionData: Props) =>
  new Map(commissionData.map(character => [character.Character, character] as const))

export const buildCreatorAliasesMap = (creatorAliases: CreatorAliasPayload[]) =>
  new Map(creatorAliases.map(row => [row.creatorName, row.aliases] as const))
