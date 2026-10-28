export interface ListboxOptions {
  inputEl: HTMLInputElement
  listEl: HTMLElement
  getItemCount: () => number
  onSelect: (index: number) => void
  onDismiss: () => void
}

export interface ListboxController {
  bind: () => void
  unbind: () => void
  setActiveIndex: (index: number) => void
  getActiveIndex: () => number
  reset: () => void
}

function getItems(listEl: HTMLElement): NodeListOf<HTMLElement> {
  return listEl.querySelectorAll<HTMLElement>('[role="option"]')
}

export function createListboxController(options: ListboxOptions): ListboxController {
  const { inputEl, listEl, getItemCount, onSelect, onDismiss } = options
  let activeIndex = -1

  function setActiveIndex(index: number) {
    const items = getItems(listEl)

    // Clear previous highlight
    if (activeIndex >= 0 && activeIndex < items.length) {
      items[activeIndex].dataset.selected = 'false'
    }

    activeIndex = index

    // Set new highlight
    if (index >= 0 && index < items.length) {
      const item = items[index]
      item.dataset.selected = 'true'
      item.scrollIntoView({ block: 'nearest' })
      inputEl.setAttribute('aria-activedescendant', item.id)
    }
    else {
      inputEl.removeAttribute('aria-activedescendant')
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const count = getItemCount()

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        if (count === 0)
          return
        const next = activeIndex < count - 1
          ? activeIndex + 1
          : 0
        setActiveIndex(next)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (count === 0)
          return
        const prev = activeIndex > 0
          ? activeIndex - 1
          : count - 1
        setActiveIndex(prev)
        break
      }
      case 'Enter': {
        if (activeIndex >= 0) {
          e.preventDefault()
          onSelect(activeIndex)
        }
        break
      }
      case 'Escape': {
        e.preventDefault()
        e.stopPropagation()
        onDismiss()
        break
      }
    }
  }

  return {
    bind() {
      inputEl.addEventListener('keydown', handleKeydown)
    },
    unbind() {
      inputEl.removeEventListener('keydown', handleKeydown)
    },
    setActiveIndex,
    getActiveIndex: () => activeIndex,
    reset() {
      const count = getItemCount()
      setActiveIndex(count > 0
        ? 0
        : -1)
    },
  }
}
