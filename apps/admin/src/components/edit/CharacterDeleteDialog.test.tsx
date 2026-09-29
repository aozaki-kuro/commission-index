// @vitest-environment jsdom
import { act, createElement, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { CharacterDeleteDialog } from './CharacterDeleteDialog'

function Harness() {
  const [isOpen, setIsOpen] = useState(false)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement>(null)

  return createElement(
    'div',
    null,
    createElement('button', {
      onClick: (event) => {
        returnFocusRef.current = event.currentTarget
        setIsOpen(true)
      },
      type: 'button',
    }, 'Open delete'),
    createElement(CharacterDeleteDialog, {
      cancelButtonRef,
      characterName: 'Test character',
      commissionCount: 1,
      isDeletePending: false,
      isOpen,
      onClose: () => setIsOpen(false),
      onConfirm: () => {},
      returnFocusRef,
    }),
  )
}

describe('character delete dialog accessibility', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
  })

  it('focuses Cancel first and restores focus to the opener when closed', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root.render(createElement(Harness)))
    const opener = container.querySelector('button')!
    await act(async () => {
      opener.focus()
      opener.click()
    })

    const dialog = document.body.querySelector('[role="alertdialog"]')!
    const overlay = document.body.querySelector('[data-dialog-overlay="alert"]')!
    const cancel = [...dialog.querySelectorAll('button')]
      .find(button => button.textContent === 'Cancel')!
    const labelledBy = dialog.getAttribute('aria-labelledby')
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.className).toContain('w-[calc(100%-2rem)]')
    expect(dialog.className).toContain('max-w-md')
    expect(dialog.className).toContain('rounded-2xl')
    expect(dialog.className).toContain('bg-white')
    expect(dialog.className).toContain('shadow-xl')
    expect(dialog.className).toContain('p-6')
    expect(dialog.className).toContain('dialogEnter_240ms_cubic-bezier(0.25,1,0.5,1)')
    expect(overlay.className).toContain('bg-black/40')
    expect(overlay.className).toContain('backdrop-blur-[2px]')
    expect(overlay.className).toContain('overlayFadeIn_200ms_ease-out')
    expect(dialog.querySelector('button:last-child')?.textContent).toBe('Delete')
    expect(labelledBy).toBeTruthy()
    expect(dialog.querySelector(`#${labelledBy}`)?.textContent).toBe('Delete character?')
    expect(describedBy).toBeTruthy()
    expect(dialog.querySelector(`#${describedBy}`)?.textContent).toContain('cannot be undone')
    expect(document.activeElement).toBe(cancel)

    cancel.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    }))
    const confirm = dialog.querySelector('button:last-child')!
    expect(document.activeElement).toBe(confirm)

    confirm.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    }))
    expect(document.activeElement).toBe(cancel)

    await act(async () => {
      cancel.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(document.activeElement).toBe(opener)
  })

  it('isolates the background and closes on Escape', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root.render(createElement(Harness)))
    const opener = container.querySelector('button')!
    await act(async () => {
      opener.focus()
      opener.click()
    })

    const dialog = document.body.querySelector('[role="alertdialog"]')!
    expect(container.getAttribute('aria-hidden')).toBe('true')
    expect(document.body.style.pointerEvents).toBe('none')
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Escape',
      }))
    })
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    expect(container.getAttribute('aria-hidden')).toBeNull()
    expect(document.body.style.pointerEvents).not.toBe('none')
    expect(document.activeElement).toBe(opener)
  })
})
