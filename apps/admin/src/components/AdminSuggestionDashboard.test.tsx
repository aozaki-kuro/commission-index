// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveHomeFeaturedKeywordsAction } from '../lib/adminActions'
import { readCachedAdminJson } from '../lib/adminApi'
import { markPendingRebuild } from '../lib/pendingRebuildSignal'
import { AdminSuggestionDashboard } from './AdminSuggestionDashboard'

vi.mock('../lib/adminActions', () => ({ saveHomeFeaturedKeywordsAction: vi.fn() }))
vi.mock('../lib/pendingRebuildSignal', () => ({ markPendingRebuild: vi.fn() }))

describe('suggestion editor', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  async function render(featuredKeywords: string[], keywordOptions: string[], isReady = true) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    if (!container) {
      container = document.createElement('div')
      document.body.append(container)
      root = createRoot(container)
    }
    await act(async () => root.render(<AdminSuggestionDashboard featuredKeywords={featuredKeywords} keywordOptions={keywordOptions} isReady={isReady} isLoading={!isReady} />))
  }

  function values() {
    return JSON.parse(container.querySelector<HTMLInputElement>('input[name="keywordsJson"]')!.value)
  }

  async function click(label: string) {
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    expect(button).not.toBeNull()
    await act(async () => button!.click())
  }

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
    container = undefined!
  })

  it('keeps the form mounted during loading and synchronizes the first response without false empty copy', async () => {
    await render([], [], false)
    const form = container.querySelector('form')
    expect(container.textContent).not.toContain('No featured keywords.')
    expect(container.querySelector('fieldset')?.disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    await render(['Summer'], ['Summer', 'Winter'])
    expect(container.querySelector('form')).toBe(form)
    expect(values()).toEqual(['Summer'])
    expect(container.querySelector('fieldset')?.disabled).toBe(false)
  })

  it('supports keyboard-accessible reordering and preserves the draft on background refresh', async () => {
    await render(['Summer', 'Winter'], ['Summer', 'Winter'])
    await click('Move Winter up')
    expect(values()).toEqual(['Winter', 'Summer'])
    await render(['Remote'], ['Summer', 'Winter', 'Remote'])
    expect(values()).toEqual(['Winter', 'Summer'])
    await click('Remove Winter')
    expect(values()).toEqual(['Summer'])
  })

  it('keeps the six-keyword limit while still allowing removal from the pool', async () => {
    await render(['A', 'B', 'C', 'D', 'E', 'F'], ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    const pool = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
    expect(pool.find(button => button.textContent === 'G')?.disabled).toBe(true)
    const selected = pool.find(button => button.textContent === 'A')!
    expect(selected.disabled).toBe(false)
    await act(async () => selected.click())
    const extra = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')).find(button => button.textContent === 'G')!
    expect(extra.disabled).toBe(false)
    await act(async () => extra.click())
    expect(values()).toEqual(['B', 'C', 'D', 'E', 'F', 'G'])
  })

  it('marks every successful save and caches the submitted order', async () => {
    vi.mocked(saveHomeFeaturedKeywordsAction).mockResolvedValue({ status: 'success', message: 'Saved' })
    vi.mocked(markPendingRebuild).mockClear()
    await render(['Summer', 'Winter'], ['Summer', 'Winter'])
    await act(async () => container.querySelector('form')!.requestSubmit())
    await click('Move Winter up')
    await act(async () => container.querySelector('form')!.requestSubmit())
    expect(markPendingRebuild).toHaveBeenCalledTimes(2)
    expect(readCachedAdminJson('/api/admin/suggestion')).toEqual({
      featuredKeywords: ['Winter', 'Summer'],
      keywordOptions: ['Summer', 'Winter'],
    })
  })

  it('accepts refreshed values after successfully saving the current draft', async () => {
    vi.mocked(saveHomeFeaturedKeywordsAction).mockResolvedValue({ status: 'success', message: 'Saved' })
    await render(['Summer', 'Winter'], ['Summer', 'Winter'])
    await click('Move Winter up')
    await act(async () => container.querySelector('form')!.requestSubmit())
    await render(['Remote'], ['Summer', 'Winter', 'Remote'])
    expect(values()).toEqual(['Remote'])
  })

  it('preserves the unsaved draft across refresh after a failed save', async () => {
    vi.mocked(saveHomeFeaturedKeywordsAction).mockResolvedValue({ status: 'error', message: 'Connection interrupted' })
    await render(['Summer', 'Winter'], ['Summer', 'Winter'])
    await click('Move Winter up')
    await act(async () => container.querySelector('form')!.requestSubmit())
    await render(['Remote'], ['Summer', 'Winter', 'Remote'])
    expect(values()).toEqual(['Winter', 'Summer'])
  })
})
