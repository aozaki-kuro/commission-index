// @vitest-environment jsdom
import type { AdminCommissionSearchRow, CharacterRow, CommissionRow } from '@commission-index/domain'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from '../FloatingNotice'
import { CommissionManager } from './CommissionManager'

const api = vi.hoisted(() => ({ load: vi.fn(), refresh: vi.fn(), pendingSave: null as (() => void) | null }))
vi.mock('../../lib/adminActions', () => ({
  fetchCharacterCommissionsAction: api.load,
  deleteCharacterAction: vi.fn(),
  renameCharacter: vi.fn(),
  saveCharacterOrder: vi.fn(),
}))
vi.mock('./KeywordReplacePopover', () => ({
  KeywordReplacePopover: ({ onComplete }: { onComplete: () => void }) => createElement('button', { onClick: onComplete }, 'Complete replacement'),
}))
vi.mock('./CommissionEditDrawer', () => ({
  CommissionEditDrawer: ({ commission, onSaveSuccess, onDelete, onClose }: { commission: CommissionRow | null, onSaveSuccess: (row: CommissionRow) => void, onDelete: () => void, onClose: () => void }) => commission
    ? createElement('div', { 'role': 'dialog', 'data-keyword': commission.keyword }, `Editing ${commission.id}`, createElement('button', { onClick: () => onSaveSuccess({ ...commission, creatorName: 'Changed creator' }) }, 'Save edit'), createElement('button', { onClick: onDelete }, 'Delete entry'), createElement('button', { onClick: onClose }, 'Close editor'), createElement('button', { onClick: () => { api.pendingSave = () => onSaveSuccess({ ...commission, creatorName: 'Late edit' }) } }, 'Start delayed save'))
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
    api.pendingSave = null
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  const render = (searchRows = rows) => act(async () => root.render(
    <FloatingNoticeProvider>
      <CommissionManager characters={characters} commissionSearchRows={searchRows} creatorAliases={[]} onRefresh={api.refresh} />
    </FloatingNoticeProvider>,
  ))
  const search = (value: string) => act(async () => {
    const input = container.querySelector('input[aria-label="Search commissions"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
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
})
