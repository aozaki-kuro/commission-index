import 'server-only'

import { getCharacterStatus as loadCharacterStatus } from '#data/commissionStatus'

interface CharacterEntry {
  DisplayName: string
}

export const getCharacterStatus = () => loadCharacterStatus()

export const isCharacterActive = (character: string): boolean => {
  const status = loadCharacterStatus()
  return status.active.some(char => char.DisplayName === character)
}

export const getAllCharacters = (): CharacterEntry[] => {
  const status = loadCharacterStatus()
  return [...status.active, ...status.stale]
}
