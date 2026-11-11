import type { CharacterNavItem } from '@commission-index/domain'
import fs from 'node:fs'
import { getGeneratedFactSourceContent, resolveGeneratedFactSourcePath } from '@data/generatedFactSource'
import { kebabCase } from '@lib/utils/strings'

interface CharacterEntry {
  DisplayName: string
}

interface CharacterIdentity {
  id: number
  name: string
  sortOrder?: number
}

export type { CharacterNavItem }

/**
 * Create a slug used for section anchors. Not an id on its own: it can be empty or shared by several names,
 * so anchors go through getCharacterSectionId.
 */
export const getCharacterSlug = (name: string): string => kebabCase(name)

/**
 * Assigns every character a non-empty, unique section id. A character keeps its slug (public deep links) unless
 * the slug is empty (no ASCII letters/digits) or an earlier character already holds it; those fall back to
 * `character-<id>`, which survives renames.
 */
export function buildCharacterSectionIds(characters: readonly CharacterIdentity[]): Map<string, string> {
  const ordered = characters.toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const ids = new Map<string, string>()
  const taken = new Set<string>()
  const needsFallback: CharacterIdentity[] = []

  for (const character of ordered) {
    const slug = getCharacterSlug(character.name)
    if (slug && !taken.has(slug)) {
      taken.add(slug)
      ids.set(character.name, slug)
    }
    else {
      needsFallback.push(character)
    }
  }
  // Fallbacks are assigned after every slug, so a name that slugs to `character-<n>` keeps its existing id.
  for (const character of needsFallback) {
    const base = `character-${character.id}`
    let id = base
    for (let suffix = 2; taken.has(id); suffix += 1) {
      id = `${base}-${suffix}`
    }
    taken.add(id)
    ids.set(character.name, id)
  }
  return ids
}

const EMPTY_SECTION_IDS = new Map<string, string>()
let cachedSectionIds: { key: string, ids: Map<string, string> } | null = null

function readSectionIds(): Map<string, string> {
  const contentPath = resolveGeneratedFactSourcePath('content.json')
  // Unit tests run without an export; the build always has one, since export precedes it.
  if (!fs.existsSync(contentPath))
    return EMPTY_SECTION_IDS
  // Dev re-reads the fact source on every call, and this runs once per rendered anchor: key on the file instead.
  const key = `${contentPath}:${fs.statSync(contentPath).mtimeMs}`
  if (cachedSectionIds?.key !== key) {
    cachedSectionIds = {
      key,
      ids: buildCharacterSectionIds(getGeneratedFactSourceContent().characters),
    }
  }
  return cachedSectionIds.ids
}

/**
 * Names outside the fact source (e.g. the intro block) keep their slug; an empty slug falls back to the name with
 * whitespace dashed, which is a valid HTML id and still unique per name.
 */
function fallbackSectionId(name: string): string {
  return getCharacterSlug(name) || `character-${name.trim().replace(/\s+/g, '-')}`
}

/**
 * Section id corresponds to the wrapper element id. The only producer of character anchor ids: title ids, hashes,
 * entry anchors and RSS links all derive from it.
 */
export function getCharacterSectionId(name: string): string {
  return readSectionIds().get(name) ?? fallbackSectionId(name)
}

/**
 * Title id is used for heading anchors.
 */
export const getCharacterTitleId = (name: string): string => `title-${getCharacterSectionId(name)}`

/**
 * Section hash anchors to the listing wrapper.
 */
export const getCharacterSectionHash = (name: string): string => `#${getCharacterSectionId(name)}`

/**
 * Title hash anchors to the heading element.
 */
export const getCharacterTitleHash = (name: string): string => `#${getCharacterTitleId(name)}`

/**
 * Entry anchor shared by the character and timeline panels.
 */
export function getCommissionEntryAnchorId(characterName: string, publicId: string): string {
  return `${getCharacterSectionId(characterName)}-commission-${publicId}`
}

/**
 * Normalize character entries to navigation metadata.
 */
export function buildCharacterNavItems(characters: CharacterEntry[]): CharacterNavItem[] {
  return characters.map((character) => {
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
}
