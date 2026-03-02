import type { Props } from '#data/types'

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
}

export const buildCommissionDataMap = (commissionData: Props) =>
  new Map(commissionData.map(character => [character.Character, character] as const))

export const buildCreatorAliasesMap = (creatorAliases: CreatorAliasPayload[]) =>
  new Map(creatorAliases.map(row => [row.creatorName, row.aliases] as const))
