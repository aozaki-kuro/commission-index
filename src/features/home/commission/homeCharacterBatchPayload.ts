import type { HomeCharacterBatchStatus } from '#features/home/server/homeCharacterBatches'

export type HomeCharacterBatchImagePayload = {
  src: string
  srcSet: string
  sizes: string
  width: number
  height: number
}

export type HomeCharacterBatchLinkPayload = {
  label: string
  url: string
}

export type HomeCharacterBatchInterestPayload = {
  key: string
  label: string
  title: string
  recordedLabel: string
  recordedTitle: string
}

export type HomeCharacterBatchEntryPayload = {
  id: string
  sectionId: string
  searchKey: string
  searchText: string
  searchSuggest: string
  altText: string
  image: HomeCharacterBatchImagePayload | null
  sourceImageNotFoundText: string
  timeLabel: string
  primaryText: string
  secondaryText: string | null
  links: HomeCharacterBatchLinkPayload[]
  interest: HomeCharacterBatchInterestPayload | null
}

export type HomeCharacterBatchSectionPayload = {
  displayName: string
  status: HomeCharacterBatchStatus
  sectionId: string
  titleId: string
  sectionHash: string
  totalCommissions: number
  toBeAnnouncedText: string
  entries: HomeCharacterBatchEntryPayload[]
}

export type HomeCharacterBatchPayload = {
  batchIndex: number
  sections: HomeCharacterBatchSectionPayload[]
  status: HomeCharacterBatchStatus
}
