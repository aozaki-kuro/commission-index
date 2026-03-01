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
  saveUploadedSourceImage: vi.fn(),
  replaceUploadedSourceImage: vi.fn(),
  removeSourceImageFile: vi.fn(),
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
}))

vi.mock('./imageUpload', () => ({
  saveUploadedSourceImage: (...args: unknown[]) => mocks.saveUploadedSourceImage(...args),
  replaceUploadedSourceImage: (...args: unknown[]) => mocks.replaceUploadedSourceImage(...args),
  removeSourceImageFile: (...args: unknown[]) => mocks.removeSourceImageFile(...args),
}))

const loadActions = async (nodeEnv: 'development' | 'production' = 'development') => {
  vi.stubEnv('NODE_ENV', nodeEnv)
  vi.resetModules()
  return import('./actions.dev')
}

describe('admin actions.dev', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.createCommission.mockReturnValue({ characterName: 'L*cia' })
    mocks.updateCommission.mockReturnValue(undefined)
    mocks.deleteCommission.mockReturnValue(undefined)
    mocks.deleteCharacter.mockReturnValue(undefined)
    mocks.runImagePipeline.mockResolvedValue(undefined)
    mocks.saveUploadedSourceImage.mockResolvedValue({
      targetPath: '/tmp/test-upload.jpg',
      targetFileName: '20991231_Vitest.jpg',
    })
    mocks.replaceUploadedSourceImage.mockResolvedValue({
      targetPath: '/tmp/test-reupload.jpg',
      targetFileName: '20991231_Vitest.jpg',
    })
    mocks.removeSourceImageFile.mockResolvedValue(undefined)
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
    await expect(actions.replaceCommissionSourceImageAction(formData)).resolves.toEqual({
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

  it('parses commission form fields without triggering pipeline when no source upload exists', async () => {
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
    mocks.createCommission.mockReturnValueOnce({ characterName: 'AZKi' })

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
    expect(mocks.runImagePipeline).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rss.xml')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('validates update commission id and updates commission successfully', async () => {
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
    expect(mocks.runImagePipeline).not.toHaveBeenCalled()
  })

  it('uploads source image and runs image pipeline', async () => {
    const actions = await loadActions('development')
    const prev: FormState = { status: 'idle', message: '' }
    const formData = new FormData()
    formData.set('characterId', '3')
    formData.set('fileName', '20991231_Vitest')
    formData.set('links', '')
    formData.set('sourceImage', new File([new Uint8Array([1, 2, 3])], 'source.png'))

    const result = await actions.addCommissionAction(prev, formData)

    expect(result).toEqual({
      status: 'success',
      message: 'Commission "20991231_Vitest" added to L*cia.',
    })
    expect(mocks.saveUploadedSourceImage).toHaveBeenCalledWith(
      expect.objectContaining({
        commissionFileName: '20991231_Vitest',
      }),
    )
    expect(mocks.runImagePipeline).toHaveBeenCalledTimes(1)
  })

  it('returns upload errors without creating a commission', async () => {
    const actions = await loadActions('development')
    const prev: FormState = { status: 'idle', message: '' }
    const formData = new FormData()
    formData.set('characterId', '3')
    formData.set('fileName', '20991231_Vitest')
    formData.set('sourceImage', new File([new Uint8Array([1])], 'source.gif'))
    mocks.saveUploadedSourceImage.mockRejectedValueOnce(
      new Error('Only JPG and PNG uploads are supported.'),
    )

    const result = await actions.addCommissionAction(prev, formData)

    expect(result).toEqual({
      status: 'error',
      message: 'Only JPG and PNG uploads are supported.',
    })
    expect(mocks.createCommission).not.toHaveBeenCalled()
  })

  it('rolls back uploaded source image when commission creation fails', async () => {
    const actions = await loadActions('development')
    const prev: FormState = { status: 'idle', message: '' }
    const formData = new FormData()
    formData.set('characterId', '3')
    formData.set('fileName', '20991231_Vitest')
    formData.set('sourceImage', new File([new Uint8Array([1, 2, 3])], 'source.jpg'))
    mocks.saveUploadedSourceImage.mockResolvedValueOnce({
      targetPath: '/tmp/rollback.jpg',
      targetFileName: '20991231_Vitest.jpg',
    })
    mocks.createCommission.mockImplementationOnce(() => {
      throw new Error('database write failed')
    })

    const result = await actions.addCommissionAction(prev, formData)

    expect(result).toEqual({
      status: 'error',
      message: 'database write failed',
    })
    expect(mocks.removeSourceImageFile).toHaveBeenCalledWith('/tmp/rollback.jpg')
  })

  it('validates replace source image payload before upload', async () => {
    const actions = await loadActions('development')
    const invalidIdData = new FormData()
    invalidIdData.set('id', '0')
    invalidIdData.set('commissionFileName', '20991231_Vitest')
    invalidIdData.set('sourceImage', new File([new Uint8Array([1])], 'source.png'))

    await expect(actions.replaceCommissionSourceImageAction(invalidIdData)).resolves.toEqual({
      status: 'error',
      message: 'Invalid commission identifier.',
    })
    expect(mocks.replaceUploadedSourceImage).not.toHaveBeenCalled()

    const missingFileNameData = new FormData()
    missingFileNameData.set('id', '17')
    missingFileNameData.set('sourceImage', new File([new Uint8Array([1])], 'source.png'))

    await expect(actions.replaceCommissionSourceImageAction(missingFileNameData)).resolves.toEqual({
      status: 'error',
      message: 'File name is required.',
    })
    expect(mocks.replaceUploadedSourceImage).not.toHaveBeenCalled()

    const missingImageData = new FormData()
    missingImageData.set('id', '17')
    missingImageData.set('commissionFileName', '20991231_Vitest')

    await expect(actions.replaceCommissionSourceImageAction(missingImageData)).resolves.toEqual({
      status: 'error',
      message: 'Source image is required.',
    })
  })

  it('replaces source image and runs image pipeline', async () => {
    const actions = await loadActions('development')
    const formData = new FormData()
    formData.set('id', '17')
    formData.set('commissionFileName', '20991231_Vitest')
    formData.set('sourceImage', new File([new Uint8Array([1, 2, 3])], 'source.png'))

    const result = await actions.replaceCommissionSourceImageAction(formData)

    expect(result).toEqual({
      status: 'success',
      message: 'Source image for "20991231_Vitest" replaced.',
    })
    expect(mocks.replaceUploadedSourceImage).toHaveBeenCalledWith({
      commissionFileName: '20991231_Vitest',
      file: expect.any(File),
    })
    expect(mocks.runImagePipeline).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rss.xml')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('surfaces replace source image upload errors', async () => {
    const actions = await loadActions('development')
    const formData = new FormData()
    formData.set('id', '17')
    formData.set('commissionFileName', '20991231_Vitest')
    formData.set('sourceImage', new File([new Uint8Array([1, 2, 3])], 'source.png'))
    mocks.replaceUploadedSourceImage.mockRejectedValueOnce(
      new Error('Only JPG and PNG uploads are supported.'),
    )

    await expect(actions.replaceCommissionSourceImageAction(formData)).resolves.toEqual({
      status: 'error',
      message: 'Only JPG and PNG uploads are supported.',
    })
    expect(mocks.runImagePipeline).not.toHaveBeenCalled()
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

    mocks.deleteCommission.mockReturnValueOnce(undefined)
    expect(await actions.deleteCommissionAction(7)).toEqual({
      status: 'success',
      message: 'Commission deleted.',
    })
    expect(mocks.runImagePipeline).not.toHaveBeenCalled()
  })
})
