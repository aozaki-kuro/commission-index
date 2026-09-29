export interface BatchImagePayload {
  src: string
  srcSet: string
  sizes: string
  width: number
  height: number
}

export interface BatchLinkPayload {
  label: string
  url: string
}

export interface BatchInterestPayload {
  key: string
  label: string
  title: string
  recordedLabel: string
  recordedTitle: string
}

export interface BatchEntryPayload {
  id: string
  legacyAnchorId?: string | null
  sectionId: string
  searchKey: string
  searchText: string
  searchSuggest: string
  altText: string
  image: BatchImagePayload | null
  sourceImageNotFoundText: string
  timeLabel: string
  primaryText: string
  secondaryText: string | null
  links: BatchLinkPayload[]
  interest: BatchInterestPayload | null
}
