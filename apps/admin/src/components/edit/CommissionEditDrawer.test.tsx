// @vitest-environment jsdom
import type { CommissionRow } from '@commission-index/domain'
import type { RefObject } from 'react'
import type { DiscardGuard } from './CommissionEditDrawer'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommissionEditDrawer } from './CommissionEditDrawer'

vi.mock('./CommissionEditForm', () => ({
  CommissionEditForm: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => {
    const [value, setValue] = useState('')
    return (
      <div>
        <input
          aria-label="Draft"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            onDirtyChange?.(event.target.value !== '')
          }}
        />
        <button type="button" onClick={() => onDirtyChange?.(false)}>Mark saved</button>
      </div>
    )
  },
}))

const commission: CommissionRow = {
  id: 1,
  publicId: '00000000-0000-4000-8000-000000000001',
  characterId: 1,
  characterName: 'Character',
  commissionDate: '2026-09-29',
  creatorName: 'Creator',
  fileName: 'asset',
  workGroupId: null,
  partNumber: null,
  hidden: false,
  links: [],
}

describe('commission edit drawer discard guard', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const onClose = vi.fn()
  let guardRef: RefObject<DiscardGuard | null>

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    onClose.mockReset()
    guardRef = { current: null }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(
      <CommissionEditDrawer
        open
        commission={commission}
        characters={[]}
        commissionSearchRows={[]}
        discardGuardRef={guardRef}
        onClose={onClose}
        onDelete={vi.fn()}
        onSaveSuccess={vi.fn()}
      />,
    ))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const draft = () => document.querySelector<HTMLInputElement>('input[aria-label="Draft"]')
  const typeDraft = (value: string) => act(async () => {
    const input = draft()!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const pressEscape = () => act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  const prompt = () => document.querySelector('[role="alertdialog"]')
  const button = (label: string) => [
    ...document.querySelectorAll('button'),
  ].find(element => element.textContent === label || element.getAttribute('aria-label') === label)!

  it('asks before Esc discards a dirty draft and keeps editing by default', async () => {
    await typeDraft('Unsaved')
    await pressEscape()
    expect(onClose).not.toHaveBeenCalled()
    expect(prompt()?.textContent).toContain('Discard unsaved changes?')
    expect(document.activeElement?.textContent).toBe('Keep editing')
    await act(async () => button('Keep editing').click())
    expect(prompt()).toBeNull()
    expect(draft()?.value).toBe('Unsaved')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes after Discard is confirmed', async () => {
    await typeDraft('Unsaved')
    await act(async () => button('Close').click())
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => button('Discard').click())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes a clean drawer immediately, including after a save', async () => {
    await pressEscape()
    expect(onClose).toHaveBeenCalledTimes(1)
    await typeDraft('Saved soon')
    await act(async () => button('Mark saved').click())
    await act(async () => button('Close').click())
    expect(prompt()).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('guards other discarding actions such as switching records', async () => {
    const action = vi.fn()
    await act(async () => guardRef.current!(action))
    expect(action).toHaveBeenCalledTimes(1)
    await typeDraft('Unsaved')
    await act(async () => guardRef.current!(action))
    expect(action).toHaveBeenCalledTimes(1)
    expect(prompt()).not.toBeNull()
    await act(async () => button('Discard').click())
    expect(action).toHaveBeenCalledTimes(2)
    expect(onClose).not.toHaveBeenCalled()
  })
})
