import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormState } from './types'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createCharacter: vi.fn(),
  createCommission: vi.fn(),
  updateCharacter: vi.fn(),
  updateCharactersOrder: vi.fn(),
  updateCommission: vi.fn(),
  saveCreatorAliasesBatch: vi.fn(),
  deleteCharacter: vi.fn(),
  deleteCommission: vi.fn(),
  runImagePipeline: vi.fn(),
  runImageImportPipeline: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}))

vi.mock('#lib/admin/db', () => ({
  createCharacter: (...args: unknown[]) => mocks.createCharacter(...args),
  createCommission: (...args: unknown[]) => mocks.createCommission(...args),
  updateCharacter: (...args: unknown[]) => mocks.updateCharacter(...args),
  updateCharactersOrder: (...args: unknown[]) => mocks.updateCharactersOrder(...args),
  updateCommission: (...args: unknown[]) => mocks.updateCommission(...args),
  saveCreatorAliasesBatch: (...args: unknown[]) => mocks.saveCreatorAliasesBatch(...args),
  deleteCharacter: (...args: unknown[]) => mocks.deleteCharacter(...args),
  deleteCommission: (...args: unknown[]) => mocks.deleteCommission(...args),
}))

vi.mock('./imagePipeline', () => ({
  runImagePipeline: (...args: unknown[]) => mocks.runImagePipeline(...args),
  runImageImportPipeline: (...args: unknown[]) => mocks.runImageImportPipeline(...args),
}))

const loadActions = async (nodeEnv: 'development' | 'production' = 'development') => {
  vi.stubEnv('NODE_ENV', nodeEnv)
  vi.resetModules()
  return import('./actions.dev')
}

describe('admin actions.dev', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.createCommission.mockReturnValue({ characterName: 'L*cia', imageMapChanged: false })
    mocks.updateCommission.mockReturnValue({ imageMapChanged: false })
    mocks.deleteCommission.mockReturnValue({ imageMapChanged: false })
    mocks.deleteCharacter.mockReturnValue({ imageMapChanged: false })
    mocks.runImagePipeline.mockResolvedValue(undefined)
    mocks.runImageImportPipeline.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns disabled state for form actions in production', async () => {
    const actions = await loadActions('production')
    const prev: FormState = { status: 'idle', message: '' }
    const formData = new FormData()

    await expect(actions.addCharacterAction(prev, formData)).resolves.toEqual({
      status: 'error',
      message: 'Writable actions are only available in development mode.',
    })
    await expect(actions.addCommissionAction(prev, formData)).resolves.toEqual({
      status: 'error',
      message: 'Writable actions are only available in development mode.',
    })
    await expect(actions.updateCommissionAction(prev, formData)).resolves.toEqual({
      status: 'error',
      message: 'Writable actions are only available in development mode.',
    })
  })

  it('validates required commission fields before calling db layer', async () => {
    const actions = await loadActions('development')
    const prev: FormState = { status: 'idle', message: '' }
    const formData = new FormData()
    formData.set('characterId', '0')
    formData.set('fileName', '')

    await expect(actions.addCommissionAction(prev, formData)).resolves.toEqual({
      status: 'error',
      message: 'Character selection is required.',
    })
    expect(mocks.createCommission).not.toHaveBeenCalled()

    formData.set('characterId', '1')
    await expect(actions.addCommissionAction(prev, formData)).resolves.toEqual({
      status: 'error',
      message: 'File name is required.',
    })
    expect(mocks.createCommission).not.toHaveBeenCalled()
  })

  it('parses commission form fields and triggers image pipeline when image map changes', async () => {
    const actions = await loadActions('development')
    const prev: FormState = { status: 'idle', message: '' }
    const formData = new FormData()
    formData.set('characterId', '3')
    formData.set('fileName', ' 20991231_Vitest ')
    formData.set('links', 'https://a.example\n\nhttps://b.example  \n')
    formData.set('design', '  concept ')
    formData.set('description', '  desc ')
    formData.set('keyword', ' foo, bar ')
    formData.set('hidden', 'on')
    mocks.createCommission.mockReturnValueOnce({ characterName: 'AZKi', imageMapChanged: true })

    const result = await actions.addCommissionAction(prev, formData)

    expect(result).toEqual({
      status: 'success',
      message: 'Commission "20991231_Vitest" added to AZKi.',
    })
    expect(mocks.createCommission).toHaveBeenCalledWith({
      characterId: 3,
      fileName: '20991231_Vitest',
      links: ['https://a.example', 'https://b.example'],
      design: 'concept',
      description: 'desc',
      keyword: 'foo, bar',
      hidden: true,
    })
    expect(mocks.runImagePipeline).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rss.xml')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('validates update commission id and runs import pipeline when file mapping changes', async () => {
    const actions = await loadActions('development')
    const prev: FormState = { status: 'idle', message: '' }
    const invalidFormData = new FormData()
    invalidFormData.set('id', '0')
    invalidFormData.set('characterId', '1')
    invalidFormData.set('fileName', '20990101_Test')

    await expect(actions.updateCommissionAction(prev, invalidFormData)).resolves.toEqual({
      status: 'error',
      message: 'Invalid commission identifier.',
    })
    expect(mocks.updateCommission).not.toHaveBeenCalled()

    const validFormData = new FormData()
    validFormData.set('id', '42')
    validFormData.set('characterId', '1')
    validFormData.set('fileName', '20990101_Test')
    validFormData.set('links', 'https://example.com')
    mocks.updateCommission.mockReturnValueOnce({ imageMapChanged: true })

    const result = await actions.updateCommissionAction(prev, validFormData)

    expect(result).toEqual({
      status: 'success',
      message: 'Commission "20990101_Test" updated.',
    })
    expect(mocks.updateCommission).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        characterId: 1,
        fileName: '20990101_Test',
        links: ['https://example.com'],
      }),
    )
    expect(mocks.runImageImportPipeline).toHaveBeenCalledTimes(1)
  })

  it('save/delete mutation actions enforce dev mode and surface success when enabled', async () => {
    const prodActions = await loadActions('production')
    await expect(prodActions.saveCharacterOrder({ active: [1], stale: [2] })).rejects.toThrow(
      'Writable actions are only available in development mode.',
    )

    const actions = await loadActions('development')
    expect(await actions.saveCharacterOrder({ active: [3, 1], stale: [2] })).toEqual({
      status: 'success',
      message: 'Character order updated.',
    })
    expect(mocks.updateCharactersOrder).toHaveBeenCalledWith({ active: [3, 1], stale: [2] })

    mocks.deleteCommission.mockReturnValueOnce({ imageMapChanged: true })
    expect(await actions.deleteCommissionAction(7)).toEqual({
      status: 'success',
      message: 'Commission deleted.',
    })
    expect(mocks.runImageImportPipeline).toHaveBeenCalledTimes(1)
  })
})
