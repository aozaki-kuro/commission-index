import type { CharacterRow, CommissionRow } from '@commission-index/domain'
import { useMemo, useState } from 'react'
import { getCommissionSourceImageUrl } from '../lib/sourceImagePreview'

interface UseCommissionEditStateParams {
  characters: CharacterRow[]
  commission: CommissionRow
}

export function useCommissionEditState({
  characters,
  commission,
}: UseCommissionEditStateParams) {
  const sortedCharacters = useMemo(
    () => characters.toSorted((left, right) => left.sortOrder - right.sortOrder),
    [characters],
  )

  const initialCharacterId = useMemo(() => {
    const exists = characters.some(character => character.id === commission.characterId)
    return exists
      ? commission.characterId
      : (sortedCharacters[0]?.id ?? commission.characterId)
  }, [characters, commission.characterId, sortedCharacters])

  const [selectedCharacterId, setSelectedCharacterId] = useState<number>(initialCharacterId)
  const [isHidden, setIsHidden] = useState(commission.hidden)
  const [commissionDate, setCommissionDate] = useState(commission.commissionDate ?? '')
  const [creatorName, setCreatorName] = useState(commission.creatorName ?? '')
  const [linksValue, setLinksValue] = useState(() => commission.links.join('\n'))
  const [designValue, setDesignValue] = useState(commission.design ?? '')
  const [descriptionValue, setDescriptionValue] = useState(commission.description ?? '')
  const [keywordValue, setKeywordValue] = useState(commission.keyword ?? '')
  const [errorSrc, setErrorSrc] = useState<string | null>(null)

  const imageSrc = useMemo(() => getCommissionSourceImageUrl(commission.id), [commission.id])

  return {
    commissionDate,
    creatorName,
    descriptionValue,
    designValue,
    errorSrc,
    imageSrc,
    initialCharacterId,
    isHidden,
    keywordValue,
    linksValue,
    selectedCharacterId,
    setCommissionDate,
    setCreatorName,
    setDescriptionValue,
    setDesignValue,
    setErrorSrc,
    setIsHidden,
    setKeywordValue,
    setLinksValue,
    setSelectedCharacterId,
    sortedCharacters,
  }
}
