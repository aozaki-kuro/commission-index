import type { HomeCharacterBatchStatus } from '#features/home/server/homeCharacterBatches'

export interface HomeCharacterBatchImagePayload {
  src: string
  srcSet: string
  sizes: string
  width: number
  height: number
}

export interface HomeCharacterBatchLinkPayload {
  label: string
  url: string
}

export interface HomeCharacterBatchInterestPayload {
  key: string
  label: string
  title: string
  recordedLabel: string
  recordedTitle: string
}

export interface HomeCharacterBatchEntryPayload {
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

export interface HomeCharacterBatchSectionPayload {
  displayName: string
  status: HomeCharacterBatchStatus
  sectionId: string
  titleId: string
  sectionHash: string
  totalCommissions: number
  toBeAnnouncedText: string
  entries: HomeCharacterBatchEntryPayload[]
}

export interface HomeCharacterBatchPayload {
  batchIndex: number
  sections: HomeCharacterBatchSectionPayload[]
  status: HomeCharacterBatchStatus
}
