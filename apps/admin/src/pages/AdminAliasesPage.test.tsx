// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from '../components/FloatingNotice'
import { AdminAliasesPage } from './AdminAliasesPage'

const api = vi.hoisted(() => ({ fetch: vi.fn(), cached: vi.fn() }))
vi.mock('../lib/adminApi', () => ({ fetchAdminJsonWithRetry: api.fetch, readCachedAdminJson: api.cached }))
vi.mock('../lib/dataUpdateSignal', () => ({ subscribeToDataUpdates: () => () => {}, notifyDataUpdate: vi.fn() }))

const payload = { characterAliases: [{ characterName: 'Lucia', aliases: ['Luci'], commissionCount: 1 }], creatorAliases: [], keywordAliases: [] }

describe('alias bootstrap layout', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    api.fetch.mockReset()
    api.cached.mockReset()
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  const render = () => act(async () => root.render(<FloatingNoticeProvider><AdminAliasesPage /></FloatingNoticeProvider>))

  it('keeps the alias workspace mounted while the first response arrives', async () => {
    api.cached.mockReturnValue(null)
    let finish!: (value: typeof payload) => void
    api.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await render()
    const form = container.querySelector('form')
    expect(container.textContent).not.toContain('No characters available')
    expect(container.querySelector('input[type="search"]')?.hasAttribute('disabled')).toBe(true)
    await act(async () => finish(payload))
    expect(container.querySelector('form')).toBe(form)
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Luci')
    expect(container.querySelector('input[type="search"]')?.hasAttribute('disabled')).toBe(false)
  })

  it('shows cached refresh failures in a retry notice and keeps edited drafts', async () => {
    api.cached.mockReturnValue(payload)
    api.fetch.mockRejectedValueOnce(new Error('Alias fixture offline')).mockResolvedValueOnce(payload)
    await render()
    expect(container.textContent).toContain('Refresh failed. Showing saved data.')
    const field = container.querySelector<HTMLInputElement>('input[type="text"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'Local alias draft')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Try again')!.click())
    expect(api.fetch).toHaveBeenCalledTimes(2)
    expect(field.value).toBe('Local alias draft')
    expect(container.textContent).not.toContain('Refresh failed')
  })
})
