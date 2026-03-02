'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CharacterRow } from '#lib/admin/db'

type DeleteStatus = {
  type: 'success' | 'error'
  text: string
}

export interface EditableCommission {
  id: number
  characterId: number
  fileName: string
  links: string[]
  design?: string | null
  description?: string | null
  keyword?: string | null
  hidden: boolean
}

interface UseCommissionEditStateParams {
  commission: EditableCommission
  characters: CharacterRow[]
}

const buildImageSrc = (fileName: string) => `/images/webp/${encodeURIComponent(fileName)}.webp`

const useCommissionEditState = ({ commission, characters }: UseCommissionEditStateParams) => {
  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.sortOrder - b.sortOrder),
    [characters],
  )

  const initialCharacterId = useMemo(() => {
    const exists = characters.some(character => character.id === commission.characterId)
    return exists ? commission.characterId : (sortedCharacters[0]?.id ?? commission.characterId)
  }, [characters, commission.characterId, sortedCharacters])

  const [selectedCharacterId, setSelectedCharacterId] = useState<number>(initialCharacterId)
  const [isHidden, setIsHidden] = useState<boolean>(commission.hidden)
  const [fileName, setFileName] = useState(commission.fileName)
  const [linksValue, setLinksValue] = useState(() => commission.links.join('\n'))
  const [designValue, setDesignValue] = useState(commission.design ?? '')
  const [descriptionValue, setDescriptionValue] = useState(commission.description ?? '')
  const [keywordValue, setKeywordValue] = useState(commission.keyword ?? '')
  const [errorSrc, setErrorSrc] = useState<string | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus | null>(null)

  const imageSrc = useMemo(() => buildImageSrc(fileName), [fileName])

  useEffect(() => {
    if (!deleteStatus) return
    const timer = setTimeout(() => setDeleteStatus(null), 2000)
    return () => clearTimeout(timer)
  }, [deleteStatus])

  return {
    sortedCharacters,
    initialCharacterId,
    selectedCharacterId,
    setSelectedCharacterId,
    isHidden,
    setIsHidden,
    fileName,
    setFileName,
    linksValue,
    setLinksValue,
    designValue,
    setDesignValue,
    descriptionValue,
    setDescriptionValue,
    keywordValue,
    setKeywordValue,
    imageSrc,
    errorSrc,
    setErrorSrc,
    deleteStatus,
    setDeleteStatus,
  }
}

export default useCommissionEditState
