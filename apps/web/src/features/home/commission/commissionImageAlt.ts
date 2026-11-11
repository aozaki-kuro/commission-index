interface CommissionImageAltInput {
  characterName: string
  /** Creator name, or the localised anonymous label. */
  creatorLabel: string
  /** Display date as rendered beside the image; empty when unknown. */
  dateLabel: string
  partLabel: string | null
}

// The copyright line stays in `data-commission-alt` for the image notice; as alt it made a screen reader read
// the same "©… & Crystallize" for every entry. Only text already rendered beside the image goes in here.
export function buildCommissionImageAlt({ characterName, creatorLabel, dateLabel, partLabel }: CommissionImageAltInput): string {
  return [
    characterName,
    creatorLabel,
    dateLabel,
    partLabel,
  ]
    .map(part => part?.trim() ?? '')
    .filter(Boolean)
    .join(', ')
}
