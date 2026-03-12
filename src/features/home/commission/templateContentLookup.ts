const escapeAttributeSelectorValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export const templateContentContainsElementId = (root: ParentNode, id: string): boolean => {
  if (!id) return false

  if (root.querySelector<HTMLElement>(`[id="${escapeAttributeSelectorValue(id)}"]`)) return true

  return Array.from(root.querySelectorAll<HTMLTemplateElement>('template')).some(template =>
    templateContentContainsElementId(template.content, id),
  )
}
