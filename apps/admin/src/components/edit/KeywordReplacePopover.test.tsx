// @vitest-environment jsdom
import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeywordReplacePopover } from './KeywordReplacePopover'

const rows: AdminCommissionSearchRow[] = [1, 2].map(id => ({
  id,
  publicId: `00000000-0000-4000-8000-00000000000${id}`,
  characterId: 1,
  characterName: 'Character',
  commissionDate: '2026-09-29',
  creatorName: 'Creator',
  fileName: `asset-${id}`,
  workGroupId: id === 1 ? '00000000-0000-4000-8000-000000000099' : null,
  partNumber: id === 1 ? 2 : null,
  keyword: 'old',
  hidden: false,
  links: 'https://example.com',
}))

describe('keyword replacement metadata contract', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const fetchMock = vi.fn()
  const onComplete = vi.fn()
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')]
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ status: 'success' })))
    onComplete.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<KeywordReplacePopover commissionSearchRows={rows} onComplete={onComplete} />))
    await act(async () => buttons().find(button => button.getAttribute('aria-label') === 'Replace keywords')!.click())
    for (const [id, value] of [['keyword-replace-find', 'old'], ['keyword-replace-with', 'old-new']]) {
      await act(async () => {
        const input = document.getElementById(id!)!
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })
  const replace = () => act(async () => buttons().find(button => button.textContent?.trim() === 'Replace all')!.click())

  it('preserves grouped and standalone fields required by the full metadata PATCH', async () => {
    await replace()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [index, row] of rows.entries()) {
      const request = fetchMock.mock.calls[index]![1]
      expect(JSON.parse(request.body)).toMatchObject({
        workGroupId: row.workGroupId,
        partNumber: row.partNumber,
        characterId: row.characterId,
        commissionDate: row.commissionDate,
        creatorName: row.creatorName,
        hidden: row.hidden,
        links: row.links,
        keyword: 'old-new',
      })
    }
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('refreshes partial success, preserves failure feedback and retries only unfinished rows', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ status: 'success' })))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ status: 'error', message: 'Offline' }), { status: 503 }))
    await replace()
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Offline')
    expect(document.body.textContent).toContain('1 commission matched')
    const refreshed = rows.map(row => row.id === 1 ? { ...row, keyword: 'old-new' } : row)
    await act(async () => root.render(<KeywordReplacePopover commissionSearchRows={refreshed} onComplete={onComplete} />))
    await replace()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2]![0]).toContain('/commissions/2')
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('keeps the dialog open while saving and puts errors in its own dismissible notice', async () => {
    let finish!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      finish = resolve
    }))
    await replace()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    expect(buttons().find(button => button.getAttribute('aria-label') === 'Close')!.disabled).toBe(true)
    expect(buttons().find(button => button.textContent === 'Cancel')!.disabled).toBe(true)
    expect(buttons().find(button => button.textContent === 'Saving 1/2')!.disabled).toBe(true)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="dialog"]')).toBe(dialog)
    await act(async () => finish(new Response(JSON.stringify({ status: 'error', message: 'Offline' }), { status: 503 })))
    expect(dialog.querySelector('[data-notice-viewport="dialog"]')?.textContent).toContain('Offline')
    expect(dialog.querySelector('[aria-label="Replacement preview"]')?.textContent).not.toContain('Offline')
    await act(async () => buttons().find(button => button.getAttribute('aria-label') === 'Dismiss notification')!.click())
    expect(dialog.textContent).not.toContain('Offline')
    await act(async () => buttons().find(button => button.textContent === 'Cancel')!.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Replace keywords')
  })
})
