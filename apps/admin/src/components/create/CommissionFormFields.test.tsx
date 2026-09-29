// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { CommissionDateField } from './CommissionFormFields'

describe('commission date field', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
  })

  it('requires a delivery date for both create and edit forms', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root.render(createElement(CommissionDateField, {
        value: '',
        onChange: () => {},
      }))
    })

    const input = container.querySelector<HTMLInputElement>('input[name="commissionDate"]')
    expect(input).not.toBeNull()
    expect(input?.type).toBe('date')
    expect(input?.required).toBe(true)
    expect(container.querySelector('label')?.textContent).toBe('Delivery date')
  })
})
