// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAliasesDashboard } from './AdminAliasesDashboard'
import { FloatingNoticeProvider } from './FloatingNotice'

const api = vi.hoisted(() => ({ character: vi.fn(), creator: vi.fn(), keyword: vi.fn(), mark: vi.fn(), notify: vi.fn(), saved: vi.fn() }))
vi.mock('../lib/adminActions', () => ({ saveCharacterAliasesBatchAction: api.character, saveCreatorAliasesBatchAction: api.creator, saveKeywordAliasesBatchAction: api.keyword }))
vi.mock('../lib/dataUpdateSignal', () => ({ notifyDataUpdate: api.notify }))
vi.mock('../lib/pendingRebuildSignal', () => ({ markPendingRebuild: api.mark }))

const characters = [{ characterName: 'Lucia', aliases: ['Luci'], commissionCount: 3 }]
const creators = [{ creatorName: '七市', aliases: ['Nanashi', 'Nana'], commissionCount: 2 }]
const keywords = [{ baseKeyword: 'Full body', aliases: ['Standing'], commissionCount: 2 }]

describe('alias draft and batch editing', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.clearAllMocks()
    for (const action of [api.character, api.creator, api.keyword])
      action.mockReset().mockResolvedValue({ status: 'success', message: 'Saved' })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  const render = (nextKeywords = keywords, isLoading = false) => act(async () => root.render(
    <FloatingNoticeProvider>
      <AdminAliasesDashboard characters={isLoading ? [] : characters} creators={isLoading ? [] : creators} keywords={isLoading ? [] : nextKeywords} isLoading={isLoading} onSaved={api.saved} />
    </FloatingNoticeProvider>,
  ))
  const panel = (type: string) => container.querySelector<HTMLElement>(`#aliases-panel-${type}`)!
  const input = (type: string) => panel(type).querySelector<HTMLInputElement>('input[type="text"]')!
  const edit = (element: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const tab = (type: string) => act(async () => container.querySelector<HTMLButtonElement>(`#aliases-tab-${type}`)!.click())
  const submit = (type: string) => act(async () => panel(type).querySelector('form')!.requestSubmit())
  const payload = (type: string) => JSON.parse(panel(type).querySelector<HTMLInputElement>('input[name="rowsJson"]')!.value)

  it('keeps drafts across mouse and keyboard tab changes and preserves every creator alias', async () => {
    await render()
    await edit(input('character'), 'Lucy, Lu')
    await tab('keyword')
    await edit(input('keyword'), 'Standing, fullbody')
    await act(async () => container.querySelector('[role="tablist"]')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' })))
    expect(input('character').value).toBe('Lucy, Lu')
    expect(panel('character').hidden).toBe(false)
    await tab('keyword')
    expect(input('keyword').value).toBe('Standing, fullbody')
    await tab('creator')
    expect(input('creator').value).toBe('Nanashi, Nana')
    await edit(input('creator'), 'Nanashi, Nana, Nanachi')
    await submit('creator')
    expect(JSON.parse(api.creator.mock.calls[0]![1].get('rowsJson'))).toEqual([{ creatorName: '七市', aliases: 'Nanashi, Nana, Nanachi' }])
  })

  it('keeps the shell during loading and merges new baseline rows without deleting their aliases', async () => {
    await render([], true)
    const form = panel('keyword').querySelector('form')
    expect(container.textContent).not.toContain('No characters available')
    await render()
    expect(panel('keyword').querySelector('form')).toBe(form)
    await tab('keyword')
    await edit(input('keyword'), 'Local draft')
    await render([...keywords, { baseKeyword: 'Portrait', aliases: ['Bust'], commissionCount: 1 }])
    expect([...panel('keyword').querySelectorAll<HTMLInputElement>('input[type="text"]')].map(field => field.value)).toEqual(['Local draft', 'Bust'])
    expect(payload('keyword')).toEqual([{ baseKeyword: 'Full body', aliases: 'Local draft' }])
  })

  it('filters without losing editing focus, submits explicit deletions and marks every save', async () => {
    await render()
    await tab('keyword')
    await edit(panel('keyword').querySelector<HTMLInputElement>('input[type="search"]')!, 'Standing')
    const field = input('keyword')
    field.focus()
    await edit(field, '')
    expect(document.activeElement).toBe(field)
    expect(payload('keyword')).toEqual([{ baseKeyword: 'Full body', aliases: '' }])
    await submit('keyword')
    await edit(panel('keyword').querySelector<HTMLInputElement>('input[type="search"]')!, '')
    await edit(input('keyword'), 'New alias')
    await submit('keyword')
    expect(api.keyword).toHaveBeenCalledTimes(2)
    expect(api.mark).toHaveBeenCalledTimes(2)
    expect(api.notify).toHaveBeenCalledTimes(2)
    expect(api.saved).toHaveBeenCalledTimes(2)
    expect(input('keyword').value).toBe('New alias')
    expect(payload('keyword')).toEqual([])
  })

  it('keeps failed drafts and enables retry after a rejected network request', async () => {
    await render()
    await tab('keyword')
    await edit(input('keyword'), 'Retained draft')
    api.keyword.mockRejectedValueOnce(new Error('Offline'))
    await submit('keyword')
    expect(input('keyword').value).toBe('Retained draft')
    expect(container.textContent).toContain('Offline')
    expect(api.mark).not.toHaveBeenCalled()
    await submit('keyword')
    expect(api.mark).toHaveBeenCalledOnce()
    expect(payload('keyword')).toEqual([])
  })
})
