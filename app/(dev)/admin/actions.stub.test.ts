import { describe, expect, it } from 'vitest'
import {
  addCharacterAction,
  addCommissionAction,
  deleteCharacterAction,
  deleteCommissionAction,
  renameCharacter,
  saveCharacterOrder,
  updateCommissionAction,
} from './actions.stub'

const expectedDisabledState = {
  status: 'error',
  message: 'Admin actions are only available in development mode.',
}

describe('admin actions stub', () => {
  it('returns disabled state for form actions', async () => {
    const prev = { status: 'idle', message: '' } as const
    const formData = new FormData()

    await expect(addCharacterAction(prev, formData)).resolves.toEqual(expectedDisabledState)
    await expect(addCommissionAction(prev, formData)).resolves.toEqual(expectedDisabledState)
    await expect(updateCommissionAction(prev, formData)).resolves.toEqual(expectedDisabledState)
  })

  it('returns disabled state for mutation actions', async () => {
    await expect(saveCharacterOrder({ active: [1], stale: [2] })).resolves.toEqual(
      expectedDisabledState,
    )
    await expect(renameCharacter({ id: 1, name: 'foo', status: 'active' })).resolves.toEqual(
      expectedDisabledState,
    )
    await expect(deleteCommissionAction(1)).resolves.toEqual(expectedDisabledState)
    await expect(deleteCharacterAction(1)).resolves.toEqual(expectedDisabledState)
  })
})
