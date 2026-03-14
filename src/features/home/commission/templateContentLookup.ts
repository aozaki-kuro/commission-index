const escapeAttributeSelectorValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

let templateContentIdLookupCache = new WeakMap<ParentNode, Map<string, boolean>>()

const readCachedLookup = (root: ParentNode, id: string) => {
  const cacheById = templateContentIdLookupCache.get(root)
  if (!cacheById) return null
  return cacheById.get(id) ?? null
}

const writeCachedLookup = (root: ParentNode, id: string, matched: boolean) => {
  const cacheById = templateContentIdLookupCache.get(root) ?? new Map<string, boolean>()
  cacheById.set(id, matched)
  templateContentIdLookupCache.set(root, cacheById)
  return matched
}

export const templateContentContainsElementId = (root: ParentNode, id: string): boolean => {
  if (!id) return false

  const cached = readCachedLookup(root, id)
  if (cached !== null) return cached

  if (root.querySelector<HTMLElement>(`[id="${escapeAttributeSelectorValue(id)}"]`)) {
    return writeCachedLookup(root, id, true)
  }

  return writeCachedLookup(
    root,
    id,
    Array.from(root.querySelectorAll<HTMLTemplateElement>('template')).some(template =>
      templateContentContainsElementId(template.content, id),
    ),
  )
}

export const clearTemplateContentLookupCacheForTests = () => {
  templateContentIdLookupCache = new WeakMap<ParentNode, Map<string, boolean>>()
}
