import { kebabCase } from '#lib/utils/strings'

interface CharacterEntry {
  DisplayName: string
}

export interface CharacterNavItem {
  displayName: string
  sectionId: string
  titleId: string
  sectionHash: string
  titleHash: string
}

/**
 * Create a slug used for section anchors.
 */
export const getCharacterSlug = (name: string): string => kebabCase(name)

/**
 * Section id corresponds to the wrapper element id.
 */
export const getCharacterSectionId = (name: string): string => getCharacterSlug(name)

/**
 * Title id is used for heading anchors.
 */
export const getCharacterTitleId = (name: string): string => `title-${getCharacterSlug(name)}`

/**
 * Section hash anchors to the listing wrapper.
 */
export const getCharacterSectionHash = (name: string): string => `#${getCharacterSectionId(name)}`

/**
 * Title hash anchors to the heading element.
 */
export const getCharacterTitleHash = (name: string): string => `#${getCharacterTitleId(name)}`

/**
 * Normalize character entries to navigation metadata.
 */
export const buildCharacterNavItems = (characters: CharacterEntry[]): CharacterNavItem[] =>
  characters.map(character => {
    const displayName = character.DisplayName
    const sectionId = getCharacterSectionId(displayName)
    const titleId = getCharacterTitleId(displayName)

    return {
      displayName,
      sectionId,
      titleId,
      sectionHash: `#${sectionId}`,
      titleHash: `#${titleId}`,
    }
  })
