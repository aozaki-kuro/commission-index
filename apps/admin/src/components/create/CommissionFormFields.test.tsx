// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { getDefaultPartNumber } from '../../lib/commissionWorkGroups'
import { CommissionDateField, CommissionLinksField } from './CommissionFormFields'

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

  it('shows a short public UUID at the bottom right of Links with the full value accessible', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const publicId = 'e593b69b-9e23-4433-877e-4cf0a869e17f'

    await act(async () => {
      root.render(createElement(CommissionLinksField, { publicId }))
    })

    const identity = container.querySelector<HTMLElement>('[data-commission-public-id]')
    expect(identity?.textContent?.replace(/\s+/g, ' ').trim()).toBe('UUID e593b69b9e23')
    expect(identity?.title).toBe(`Public UUID ${publicId}`)
    expect(identity?.getAttribute('aria-label')).toBe(`Public UUID ${publicId}`)
  })
})
