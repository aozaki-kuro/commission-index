// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultPartNumber } from '../../lib/commissionWorkGroups'
import { CommissionCharacterField, CommissionDateField, CommissionWorkGroupField } from './CommissionFormFields'

function PartingHarness({ initialGroup = '', initialPart = '' }: { initialGroup?: string, initialPart?: string }) {
  const [value, setValue] = useState(initialGroup)
  const [partNumber, setPartNumber] = useState(initialPart)
  return (
    <form>
      <CommissionWorkGroupField
        options={[{ id: 'existing-group', highestPartNumber: 2, label: 'Existing group' }]}
        value={value}
        onChange={setValue}
        partNumber={partNumber}
        onPartNumberChange={setPartNumber}
      />
    </form>
  )
}

function DateFieldHarness() {
  const [value, setValue] = useState('2026-04-01')

  return createElement(
    'form',
    null,
    createElement(CommissionDateField, { value, onChange: setValue }),
  )
}

describe('commission form fields', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
  })

  async function renderDateField() {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => root.render(createElement(DateFieldHarness)))
  }

  it('keeps the ISO date required and included in create/edit form data', async () => {
    await renderDateField()

    const input = container.querySelector<HTMLInputElement>('input[name="commissionDate"]')
    expect(input?.type).toBe('text')
    expect(input?.required).toBe(true)
    expect(input?.pattern).toBe('[0-9]{4}-[0-9]{2}-[0-9]{2}')
    expect(input?.value).toBe('2026-04-01')
    expect(new FormData(container.querySelector('form')!).get('commissionDate')).toBe('2026-04-01')
    expect(container.querySelector('label')?.textContent).toBe('Delivery date')
  })

  it('opens an accessible month calendar, navigates months, and submits a picked ISO date', async () => {
    await renderDateField()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Choose delivery date"]')?.click()
    })

    const calendar = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Choose delivery date"]')
    expect(calendar).not.toBeNull()
    expect(calendar?.textContent).toContain('April 2026')

    await act(async () => {
      calendar?.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')?.click()
    })
    expect(calendar?.textContent).toContain('March 2026')

    await act(async () => {
      calendar?.querySelector<HTMLButtonElement>('button[aria-label="Next month"]')?.click()
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="April 27, 2026"]')?.click()
    })

    const input = container.querySelector<HTMLInputElement>('input[name="commissionDate"]')
    expect(input?.value).toBe('2026-04-27')
    expect(new FormData(container.querySelector('form')!).get('commissionDate')).toBe('2026-04-27')
    expect(document.querySelector('[role="dialog"][aria-label="Choose delivery date"]')).toBeNull()
  })

  it('flags a future delivery date with a custom validity message before submit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
    try {
      await renderDateField()
      const input = container.querySelector<HTMLInputElement>('input[name="commissionDate"]')!
      const setTypedValue = (value: string) => act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })

      await setTypedValue('2999-12-31')
      expect(input.validity.customError).toBe(true)
      expect(input.validationMessage).toBe('Commission date cannot be in the future.')

      await setTypedValue('2026-10-10')
      expect(input.validity.customError).toBe(false)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('defaults new groups to part one and existing groups to their next part', () => {
    const options = [{
      id: '9d2c7e2b-fbc4-4fe3-96a5-e62144a83c12',
      label: 'Sakura · 2025-03-02 · Artist · 2 parts',
      highestPartNumber: 2,
    }]

    expect(getDefaultPartNumber('new', options)).toBe('1')
    expect(getDefaultPartNumber(options[0].id, options)).toBe('3')
    expect(getDefaultPartNumber('', options)).toBe('')
  })

  it('shows part fields only after opt-in and omits them from standalone submission', async () => {
    await renderDateField()
    await act(async () => root.render(<PartingHarness />))
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.checked).toBe(false)
    expect(container.querySelector('input[name="partNumber"]')).toBeNull()
    expect(new FormData(container.querySelector('form')!).get('workGroupId')).toBe('')
    await act(async () => checkbox.click())
    const data = new FormData(container.querySelector('form')!)
    expect(data.get('workGroupId')).toBe('new')
    expect(data.get('partNumber')).toBe('1')
    expect(container.querySelector<HTMLInputElement>('input[name="partNumber"]')?.required).toBe(true)
  })

  it('restores the existing group and part when an unchecked edit is checked again', async () => {
    await renderDateField()
    await act(async () => root.render(<PartingHarness initialGroup="existing-group" initialPart="2" />))
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.checked).toBe(true)
    await act(async () => checkbox.click())
    expect(new FormData(container.querySelector('form')!).get('partNumber')).toBeNull()
    await act(async () => checkbox.click())
    const data = new FormData(container.querySelector('form')!)
    expect(data.get('workGroupId')).toBe('existing-group')
    expect(data.get('partNumber')).toBe('2')
  })

  it('never presents a loading character list as empty and keeps the placeholder stable', async () => {
    await renderDateField()
    const onChange = () => {}
    await act(async () => root.render(<CommissionCharacterField options={[]} selectedCharacterId={null} onChange={onChange} dataState="loading" />))
    const loadingTrigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!
    expect(loadingTrigger.textContent).toContain('Select character')
    expect(loadingTrigger.disabled).toBe(true)
    expect(container.textContent).not.toContain('No characters')
    expect(container.textContent).not.toContain('Add a character')
    await act(async () => root.render(<CommissionCharacterField options={[{ id: 1, name: 'Character 1' }]} selectedCharacterId={null} onChange={onChange} />))
    expect(container.querySelector('[role="combobox"]')?.textContent).toBe(loadingTrigger.textContent)
    expect(container.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled).toBe(false)
  })
})
