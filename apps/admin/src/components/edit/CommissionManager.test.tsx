// @vitest-environment jsdom
import type { AdminCommissionSearchRow, CharacterRow, CommissionRow } from '@commission-index/domain'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from '../FloatingNotice'
import { CommissionManager } from './CommissionManager'

const api = vi.hoisted(() => ({ load: vi.fn(), refresh: vi.fn(), rename: vi.fn(), saveOrder: vi.fn(), pendingSave: null as (() => void) | null }))
vi.mock('../../lib/adminActions', () => ({
  fetchCharacterCommissionsAction: api.load,
  deleteCharacterAction: vi.fn(),
  renameCharacter: api.rename,
  saveCharacterOrder: api.saveOrder,
}))
vi.mock('./KeywordReplacePopover', () => ({
  KeywordReplacePopover: ({ onComplete }: { onComplete: () => void }) => createElement('button', { onClick: onComplete }, 'Complete replacement'),
}))
vi.mock('./CommissionEditDrawer', () => ({
  CommissionEditDrawer: ({ commission, onSaveSuccess, onDelete, onClose }: { commission: CommissionRow | null, onSaveSuccess: (row: CommissionRow) => void, onDelete: () => void, onClose: () => void }) => commission
    ? createElement('div', { 'role': 'dialog', 'data-keyword': commission.keyword }, `Editing ${commission.id}`, createElement('button', { onClick: () => onSaveSuccess({ ...commission, creatorName: 'Changed creator' }) }, 'Save edit'), createElement('button', { onClick: () => onSaveSuccess({ ...commission, keyword: 'Fresh keyword' }) }, 'Save keyword'), createElement('button', { onClick: onDelete }, 'Delete entry'), createElement('button', { onClick: onClose }, 'Close editor'), createElement('button', { onClick: () => { api.pendingSave = () => onSaveSuccess({ ...commission, creatorName: 'Late edit' }) } }, 'Start delayed save'))
    : null,
}))

const characters: CharacterRow[] = [
  { id: 1, name: 'First', status: 'active', sortOrder: 0, commissionCount: 1 },
  { id: 2, name: 'Second', status: 'active', sortOrder: 1, commissionCount: 1 },
]
const rows: AdminCommissionSearchRow[] = characters.map(character => ({
  id: character.id,
  publicId: `public-${character.id}`,
  characterId: character.id,
  characterName: character.name,
  commissionDate: '2026-09-29',
  creatorName: 'Creator',
  workGroupId: null,
  partNumber: null,
  fileName: `internal-${character.id}`,
  links: '',
  hidden: false,
}))
const commissions = rows.map(row => ({ ...row, links: [] }))

describe('commission manager search and disclosure lifecycle', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    window.localStorage.clear()
    api.load.mockReset().mockImplementation(async (id: number) => commissions.filter(row => row.characterId === id))
    api.refresh.mockReset()
    api.rename.mockReset().mockResolvedValue({ status: 'success' })
    api.saveOrder.mockReset().mockResolvedValue({ status: 'success' })
    api.pendingSave = null
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  const render = (searchRows = rows, refreshScope?: ReadonlySet<number> | null) => act(async () => root.render(
    <FloatingNoticeProvider>
      <CommissionManager characters={characters} commissionSearchRows={searchRows} creatorAliases={[]} onRefresh={api.refresh} refreshScope={refreshScope} />
    </FloatingNoticeProvider>,
  ))
  const search = (value: string) => act(async () => {
    const input = container.querySelector('input[aria-label="Search commissions"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  it('moves a character across the divider even when the stale group is empty', async () => {
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Enter reorder mode"]')!.click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Move Second down"]')!.click())
    expect(container.querySelector('#admin-character-2')?.getAttribute('data-character-status')).toBe('archived')
    expect(api.saveOrder).toHaveBeenLastCalledWith({ active: [1], archived: [2] })
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Move Second up"]')!.click())
    expect(container.querySelector('#admin-character-2')?.getAttribute('data-character-status')).toBe('active')
    expect(api.saveOrder).toHaveBeenLastCalledWith({ active: [1, 2], archived: [] })
  })

  it('saves the current name when focus moves to another character action', async () => {
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Rename First"]')!.click())
    const input = container.querySelector<HTMLInputElement>('[aria-label="Name for First"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Changed name')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Rename Second"]')!.focus())
    expect(api.rename).toHaveBeenCalledExactlyOnceWith({ id: 1, name: 'Changed name', status: 'active' })
    expect(container.querySelector('#admin-character-1 button[aria-expanded]')?.textContent).toContain('Changed name')
  })

  it('keeps the rename input outside buttons and cancels by keyboard or pointer without saving', async () => {
    await render()
    for (const interaction of ['keyboard', 'pointer']) {
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Rename First"]')!.click())
      const input = container.querySelector<HTMLInputElement>('[aria-label="Name for First"]')!
      expect(input.closest('button')).toBeNull()
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Changed name')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      const cancel = container.querySelector<HTMLButtonElement>('[aria-label="Cancel renaming First"]')!
      if (interaction === 'keyboard') {
        await act(async () => cancel.focus())
      }
      else {
        const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
        await act(async () => {
          cancel.dispatchEvent(pointerDown)
          // jsdom 不执行指针默认焦点行为，模拟未取消时输入失焦的浏览器路径。
          if (!pointerDown.defaultPrevented)
            input.blur()
        })
        expect(pointerDown.defaultPrevented).toBe(true)
        expect(document.activeElement).toBe(input)
      }
      await act(async () => cancel.click())
      expect(api.rename).not.toHaveBeenCalled()
      expect(container.querySelector('#admin-character-1 button[aria-expanded]')?.textContent).toContain('First')
    }
  })

  it('searches bootstrap rows without fetching or changing the browse disclosures', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1], timestamp: Date.now() }))
    await render()
    expect(api.load).toHaveBeenCalledTimes(1)
    await search('Second')
    expect(container.querySelector('[aria-label="Search results"]')?.textContent).toContain('Second')
    expect(api.load).toHaveBeenCalledTimes(1)
    await search('')
    expect(container.querySelector('#admin-character-1 button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('#admin-character-2 button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows a failed selected result and retries without opening its browse group', async () => {
    api.load.mockRejectedValueOnce(new Error('Offline'))
    await render()
    await search('Second')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click())
    expect(container.textContent).toContain('Offline — click to retry')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click())
    expect(api.load).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Editing 2')
    await search('')
    expect(container.querySelector('#admin-character-2 button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('does not open an old result after the user changes the query during loading', async () => {
    let finish!: (value: CommissionRow[]) => void
    api.load.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await render()
    await search('Second')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click())
    await search('First')
    await act(async () => finish([commissions[1]!]))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('updates search results immediately after a local save and delete', async () => {
    await render()
    await search('Second')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click())
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Save edit')!.click())
    await search('Changed creator')
    expect(container.querySelector('[aria-label="Search results"]')?.textContent).toContain('Changed creator')
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Delete entry')!.click())
    expect(container.querySelector('[aria-label="Search results"]')?.textContent).toContain('No commissions match')
    expect(api.refresh).toHaveBeenCalledTimes(2)
  })

  it('finds a keyword saved in this tab immediately', async () => {
    await render()
    await search('Second')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click())
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Save keyword')!.click())
    await search('Fresh keyword')
    expect(container.querySelector('[aria-label="Search results"]')?.textContent).toContain('Second')
    expect(api.refresh).toHaveBeenCalledOnce()
  })

  it('applies a save that finishes after a bootstrap refresh replaced the search rows', async () => {
    await render()
    await search('Second')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click())
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Start delayed save')!.click())
    // The save callback was created before this refresh; its overlay must still target the latest rows.
    await render([...rows])
    await act(async () => api.pendingSave?.())
    await search('Late edit')
    expect(container.querySelector('[aria-label="Search results"]')?.textContent).toContain('Second')
  })

  it('keeps a closed editor closed when its save finishes later', async () => {
    await render()
    await search('Second')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!.click())
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Start delayed save')!.click())
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Close editor')!.click())
    await act(async () => api.pendingSave?.())
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    await search('Late edit')
    expect(container.querySelector('[aria-label="Search results"]')?.textContent).toContain('Late edit')
  })

  it('keeps the old grid, focus and disclosures during targeted refresh and on failure', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1], timestamp: Date.now() }))
    await render()
    const thumbnail = container.querySelector('[data-commission-id="1"]')
    const input = container.querySelector('input[aria-label="Search commissions"]') as HTMLInputElement
    input.focus()
    let reject!: (error: Error) => void
    api.load.mockImplementationOnce(() => new Promise((_, failure) => {
      reject = failure
    }))
    await render([...rows])
    expect(container.querySelector('[data-commission-id="1"]')).toBe(thumbnail)
    expect(document.activeElement).toBe(input)
    expect(container.querySelector('#admin-character-1-panel')?.getAttribute('aria-busy')).toBe('true')
    await act(async () => reject(new Error('Refresh offline')))
    expect(container.querySelector('[data-commission-id="1"]')).toBe(thumbnail)
    expect(container.textContent).toContain('Refresh offline')
    expect(container.querySelector('#admin-character-1 button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true')
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Try again')!.click())
    expect(container.textContent).not.toContain('Refresh offline')
  })

  it('refetches only scoped loaded groups when new bootstrap rows land', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1, 2], timestamp: Date.now() }))
    await render()
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledTimes(2))
    api.load.mockClear()
    await render([...rows], new Set([2]))
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledWith(2))
    expect(api.load).toHaveBeenCalledTimes(1)
    api.load.mockClear()
    await render([...rows], null)
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledTimes(2))
  })

  it('keeps a refresh error from an unscoped group when a scoped refetch succeeds', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1, 2], timestamp: Date.now() }))
    await render()
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledTimes(2))
    api.load.mockImplementation(async (id: number) => {
      if (id === 1)
        throw new Error('Group one offline')
      return commissions.filter(row => row.characterId === id)
    })
    await render([...rows])
    await vi.waitFor(() => expect(container.textContent).toContain('Group one offline'))
    api.load.mockClear()
    await render([...rows], new Set([2]))
    await vi.waitFor(() => expect(api.load).toHaveBeenCalledWith(2))
    expect(api.load).not.toHaveBeenCalledWith(1)
    expect(container.textContent).toContain('Group one offline')
  })

  it('requests bootstrap refresh after keyword replacement while retaining the query', async () => {
    await render()
    await search('Second')
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Complete replacement')!.click())
    expect(api.refresh).toHaveBeenCalledOnce()
    expect((container.querySelector('input[aria-label="Search commissions"]') as HTMLInputElement).value).toBe('Second')
  })

  it.each(['browse', 'search'])('waits for fresh details after keyword replacement from %s', async (mode) => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1], timestamp: Date.now() }))
    await render()
    const thumbnail = container.querySelector('[data-commission-id="1"]')!
    let finish!: (value: CommissionRow[]) => void
    api.load.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Complete replacement')!.click())
    if (mode === 'search')
      await search('First')
    await act(async () => (mode === 'browse'
      ? thumbnail as HTMLButtonElement
      : container.querySelector<HTMLButtonElement>('[aria-label="Search results"] button')!).click())
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(api.load).toHaveBeenCalledTimes(2)
    await act(async () => finish([{ ...commissions[0]!, keyword: 'Replaced keyword' }]))
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-keyword')).toBe('Replaced keyword')
  })

  it('keeps stale cards visible but requires retry after detail refresh fails', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1], timestamp: Date.now() }))
    await render()
    const thumbnail = container.querySelector<HTMLButtonElement>('[data-commission-id="1"]')!
    let reject!: (error: Error) => void
    api.load.mockImplementationOnce(() => new Promise((_, failure) => {
      reject = failure
    }))
    await render([...rows])
    await act(async () => thumbnail.click())
    expect(api.load).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => reject(new Error('Offline')))
    expect(container.querySelector('[data-commission-id="1"]')).toBe(thumbnail)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    api.load.mockResolvedValueOnce([{ ...commissions[0]!, keyword: 'Fresh after retry' }])
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Retry opening commission')!.click())
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-keyword')).toBe('Fresh after retry')
  })

  it('continues a pending selection through a superseding background request', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1], timestamp: Date.now() }))
    await render()
    let finishOld!: (value: CommissionRow[]) => void
    let finishNew!: (value: CommissionRow[]) => void
    api.load
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve }))
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Complete replacement')!.click())
    await act(async () => container.querySelector<HTMLButtonElement>('[data-commission-id="1"]')!.click())
    await render([...rows])
    await act(async () => finishNew([{ ...commissions[0]!, keyword: 'Newest' }]))
    await act(async () => finishOld([{ ...commissions[0]!, keyword: 'Outdated' }]))
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-keyword')).toBe('Newest')
  })

  it('does not accept a detail request that started before keyword replacement', async () => {
    window.localStorage.setItem('admin-existing-open', JSON.stringify({ ids: [1], timestamp: Date.now() }))
    await render()
    let finish!: (value: CommissionRow[]) => void
    api.load.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await render([...rows])
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Complete replacement')!.click())
    await act(async () => container.querySelector<HTMLButtonElement>('[data-commission-id="1"]')!.click())
    await act(async () => finish([{ ...commissions[0]!, keyword: 'Before replacement' }]))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('Retry opening commission')
    api.load.mockResolvedValueOnce([{ ...commissions[0]!, keyword: 'After replacement' }])
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Retry opening commission')!.click())
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-keyword')).toBe('After replacement')
  })

  it('keeps unopened groups image-free and retains images after expand then collapse', async () => {
    await render()
    const firstToggle = container.querySelector<HTMLButtonElement>('#admin-character-1 button[aria-expanded]')!
    const secondToggle = container.querySelector<HTMLButtonElement>('#admin-character-2 button[aria-expanded]')!

    expect(container.querySelectorAll('#admin-character-2 img[src*="/api/admin/commissions/"]')).toHaveLength(0)
    await act(async () => firstToggle.click())
    const expandedImages = [...container.querySelectorAll<HTMLImageElement>('#admin-character-1 img[src*="/api/admin/commissions/"]')]
    expect(expandedImages.length).toBeGreaterThan(0)

    await act(async () => firstToggle.click())
    expect([...container.querySelectorAll('#admin-character-1 img[src*="/api/admin/commissions/"]')]).toEqual(expandedImages)
    expect(secondToggle.getAttribute('aria-expanded')).toBe('false')
  })
})
