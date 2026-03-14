let templateContentIdIndexCache = new WeakMap<ParentNode, Set<string>>()

const buildTemplateContentIdIndex = (root: ParentNode): Set<string> => {
  const idIndex = new Set<string>()

  root.querySelectorAll<HTMLElement>('[id]').forEach(element => {
    if (!element.id) return
    idIndex.add(element.id)
  })

  root.querySelectorAll<HTMLTemplateElement>('template').forEach(template => {
    for (const id of buildTemplateContentIdIndex(template.content)) {
      idIndex.add(id)
    }
  })

  return idIndex
}

const getTemplateContentIdIndex = (root: ParentNode): Set<string> => {
  const cached = templateContentIdIndexCache.get(root)
  if (cached) return cached

  const index = buildTemplateContentIdIndex(root)
  templateContentIdIndexCache.set(root, index)
  return index
}

export const templateContentContainsElementId = (root: ParentNode, id: string): boolean => {
  if (!id) return false
  return getTemplateContentIdIndex(root).has(id)
}

export const clearTemplateContentLookupCacheForTests = () => {
  templateContentIdIndexCache = new WeakMap<ParentNode, Set<string>>()
}
