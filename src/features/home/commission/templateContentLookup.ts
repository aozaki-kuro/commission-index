export const templateContentContainsElementId = (root: ParentNode, id: string): boolean => {
  if (!id) return false

  const directMatch = Array.from(root.querySelectorAll<HTMLElement>('[id]')).some(
    element => element.id === id,
  )
  if (directMatch) return true

  return Array.from(root.querySelectorAll<HTMLTemplateElement>('template')).some(template =>
    templateContentContainsElementId(template.content, id),
  )
}
