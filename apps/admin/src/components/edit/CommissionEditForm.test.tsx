// @vitest-environment jsdom
import type { CharacterRow, CommissionRow } from '@commission-index/domain'
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingNoticeProvider } from '../FloatingNotice'
import { CommissionEditForm } from './CommissionEditForm'

const api = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), upload: vi.fn(), saved: vi.fn(), deleted: vi.fn() }))
vi.mock('../../lib/adminActions', () => ({
  updateCommissionAction: api.save,
  deleteCommissionAction: api.remove,
  replaceCommissionSourceImageAction: api.upload,
}))
vi.mock('../../lib/dataUpdateSignal', () => ({ notifyDataUpdate: vi.fn() }))
vi.mock('../../lib/pendingRebuildSignal', () => ({ markPendingRebuild: vi.fn() }))
vi.mock('../create/DuplicateCommissionNotice', () => ({ DuplicateCommissionNotice: () => null }))
vi.mock('../create/CommissionSharedFields', () => ({
  CommissionSharedFields: (props: {
    creatorName: string
    onCreatorNameChange: (value: string) => void
    commissionDate: string
    workGroupId: string
    onWorkGroupIdChange: (value: string) => void
    partNumber: string
    onPartNumberChange: (value: string) => void
    visibilityControl: ReactNode
  }) => (
    <div>
      {props.visibilityControl}
      <input name="creatorName" value={props.creatorName} onChange={event => props.onCreatorNameChange(event.target.value)} />
      <input name="commissionDate" value={props.commissionDate} readOnly />
      <input name="workGroupId" value={props.workGroupId} readOnly />
      <input name="partNumber" value={props.partNumber} readOnly />
      <button
        type="button"
        onClick={() => {
          props.onWorkGroupIdChange('new')
          props.onPartNumberChange('1')
        }}
      >
        New part group
      </button>
    </div>
  ),
}))
vi.mock('../image/ImageCropDialog', () => ({
  ImageCropDialog: ({ file, onConfirm }: { file: File, onConfirm: (file: File) => void }) => <button type="button" onClick={() => onConfirm(file)}>Confirm crop</button>,
}))

const characters: CharacterRow[] = [{ id: 1, name: 'Character', status: 'active', sortOrder: 0, commissionCount: 1 }]
const commission: CommissionRow = {
  id: 1,
  publicId: '00000000-0000-4000-8000-000000000001',
  characterId: 1,
  characterName: 'Character',
  commissionDate: '2026-09-29',
  creatorName: 'Original',
  fileName: 'asset',
  workGroupId: null,
  partNumber: null,
  hidden: false,
  links: [],
}

describe('edit form mutation lifecycle', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const success = { status: 'success' as const, message: 'Saved.' }
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    api.save.mockResolvedValue(success)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(
      <FloatingNoticeProvider>
        <CommissionEditForm characters={characters} commission={commission} commissionSearchRows={[]} onSaveSuccess={api.saved} onDelete={api.deleted} />
      </FloatingNoticeProvider>,
    ))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })
  const button = (label: string) => [...container.querySelectorAll('button')].find(element => element.textContent === label)!
  const submit = () => act(async () => container.querySelector('form')!.requestSubmit())
  const typeCreator = (value: string) => act(async () => {
    const input = container.querySelector('input[name="creatorName"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  it('reports every successful submission and preserves the submitted snapshot', async () => {
    let finish!: (value: typeof success) => void
    api.save.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await typeCreator('Submitted')
    await submit()
    expect(button('Delete').disabled).toBe(true)
    await typeCreator('Unsaved draft')
    await act(async () => finish(success))
    expect(api.saved).toHaveBeenLastCalledWith(expect.objectContaining({ creatorName: 'Submitted' }))
    await submit()
    expect(api.saved).toHaveBeenCalledTimes(2)
    expect(api.saved).toHaveBeenLastCalledWith(expect.objectContaining({ creatorName: 'Unsaved draft' }))
  })

  it('creates a real group identity once and reuses it on subsequent saves', async () => {
    await act(async () => button('New part group').click())
    await submit()
    const firstId = api.save.mock.calls[0]![1].get('workGroupId') as string
    expect(firstId).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/)
    expect(api.saved).toHaveBeenLastCalledWith(expect.objectContaining({ workGroupId: firstId, partNumber: 1 }))
    await submit()
    expect(api.save.mock.calls[1]![1].get('workGroupId')).toBe(firstId)
    expect(container.querySelectorAll('input[name="hidden"]')).toHaveLength(1)
  })

  it('keeps delete pending until completion and retains errors until dismissal', async () => {
    let finish!: (value: { status: 'error', message: string }) => void
    api.remove.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await act(async () => button('Delete').click())
    await act(async () => button('Confirm delete').click())
    expect(button('Deleting…').disabled).toBe(true)
    expect(button('Save changes').disabled).toBe(true)
    vi.useFakeTimers()
    await act(async () => finish({ status: 'error', message: 'Offline' }))
    await act(async () => vi.advanceTimersByTime(5000))
    expect(container.textContent).toContain('Offline')
    expect(api.deleted).not.toHaveBeenCalled()
  })

  it('keeps image replacement pending until the upload resolves', async () => {
    let finish!: (value: typeof success) => void
    api.upload.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const input = container.querySelector('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [new File(['image'], 'art.png', { type: 'image/png' })] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    await act(async () => button('Confirm crop').click())
    expect(button('Save changes').disabled).toBe(true)
    expect(button('Delete').disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('[aria-label^="Reupload"]')!.disabled).toBe(true)
    await act(async () => finish(success))
    expect(button('Save changes').disabled).toBe(false)
    expect(container.querySelector('img')!.src).toContain('?v=')
  })
})
