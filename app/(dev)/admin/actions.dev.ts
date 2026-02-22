'use server'

import { revalidatePath } from 'next/cache'

import {
  createCharacter,
  createCommission,
  updateCharacter,
  updateCharactersOrder,
  updateCommission,
  deleteCharacter,
  deleteCommission,
  type CharacterStatus,
} from '#lib/admin/db'
import type { FormState } from './types'
import { runImageImportPipeline, runImagePipeline } from './imagePipeline'

const isDevelopment = process.env.NODE_ENV !== 'production'

const revalidatePublicViews = () => {
  revalidatePath('/')
  revalidatePath('/rss.xml')
}

const devGuard = (): FormState | null => {
  if (!isDevelopment) {
    return {
      status: 'error',
      message: 'Writable actions are only available in development mode.',
    }
  }

  return null
}

const ensureWritable = () => {
  if (!isDevelopment) {
    throw new Error('Writable actions are only available in development mode.')
  }
}

type ParsedCommissionFields = {
  characterId: number
  fileName: string
  links: string[]
  design: string | undefined
  description: string | undefined
  keyword: string | undefined
  hidden: boolean
}

const parseCommissionFields = (formData: FormData): ParsedCommissionFields => {
  const characterId = Number(formData.get('characterId'))
  const fileName = formData.get('fileName')?.toString().trim() ?? ''
  const linksRaw = formData.get('links')?.toString() ?? ''
  const design = formData.get('design')?.toString().trim() || undefined
  const description = formData.get('description')?.toString().trim() || undefined
  const keyword = formData.get('keyword')?.toString().trim() || undefined
  const hidden = formData.get('hidden') === 'on'

  const links = linksRaw
    .split('\n')
    .map(link => link.trim())
    .filter(Boolean)

  return {
    characterId,
    fileName,
    links,
    design,
    description,
    keyword,
    hidden,
  }
}

const validateCommissionFields = (
  fields: Pick<ParsedCommissionFields, 'characterId' | 'fileName'>,
): FormState | null => {
  if (!Number.isFinite(fields.characterId) || fields.characterId <= 0) {
    return { status: 'error', message: 'Character selection is required.' }
  }

  if (!fields.fileName) {
    return { status: 'error', message: 'File name is required.' }
  }

  return null
}

export const addCharacterAction = async (
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> => {
  const guard = devGuard()
  if (guard) return guard

  const name = formData.get('name')?.toString().trim() ?? ''
  const statusValue = (formData.get('status')?.toString() ?? 'active') as CharacterStatus

  if (!name) {
    return { status: 'error', message: 'Character name is required.' }
  }

  const status: CharacterStatus = statusValue === 'stale' ? 'stale' : 'active'

  try {
    createCharacter({ name, status })
    revalidatePublicViews()
    revalidatePath('/admin')
    return { status: 'success', message: `Character "${name}" created.` }
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to create character. Please try again.',
    }
  }
}

export const addCommissionAction = async (
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> => {
  const guard = devGuard()
  if (guard) return guard

  const fields = parseCommissionFields(formData)
  const validation = validateCommissionFields(fields)
  if (validation) return validation

  try {
    const { characterName, imageMapChanged } = createCommission({
      characterId: fields.characterId,
      fileName: fields.fileName,
      links: fields.links,
      design: fields.design,
      description: fields.description,
      keyword: fields.keyword,
      hidden: fields.hidden,
    })
    if (imageMapChanged) {
      await runImagePipeline()
    }
    revalidatePublicViews()
    revalidatePath('/admin')
    return {
      status: 'success',
      message: `Commission "${fields.fileName}" added to ${characterName}.`,
    }
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to add commission. Please try again.',
    }
  }
}

export async function saveCharacterOrder(payload: {
  active: number[]
  stale: number[]
}): Promise<FormState> {
  ensureWritable()

  try {
    updateCharactersOrder(payload)
    revalidatePublicViews()
    revalidatePath('/admin')
    return { status: 'success', message: 'Character order updated.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to update character order.',
    }
  }
}

export async function renameCharacter(payload: {
  id: number
  name: string
  status: CharacterStatus
}): Promise<FormState> {
  ensureWritable()

  const trimmed = payload.name.trim()
  if (!trimmed) {
    return { status: 'error', message: 'Character name is required.' }
  }

  try {
    updateCharacter({ id: payload.id, name: trimmed, status: payload.status })
    revalidatePublicViews()
    revalidatePath('/admin')
    return { status: 'success', message: `Character "${trimmed}" updated.` }
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to update character. Please try again.',
    }
  }
}

export const updateCommissionAction = async (
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> => {
  const guard = devGuard()
  if (guard) return guard

  const id = Number(formData.get('id'))
  const fields = parseCommissionFields(formData)

  if (!Number.isFinite(id) || id <= 0) {
    return { status: 'error', message: 'Invalid commission identifier.' }
  }

  const validation = validateCommissionFields(fields)
  if (validation) return validation

  try {
    const { imageMapChanged } = updateCommission({
      id,
      characterId: fields.characterId,
      fileName: fields.fileName,
      links: fields.links,
      design: fields.design,
      description: fields.description,
      keyword: fields.keyword,
      hidden: fields.hidden,
    })
    if (imageMapChanged) {
      await runImageImportPipeline()
    }
    revalidatePublicViews()
    revalidatePath('/admin')
    return { status: 'success', message: `Commission "${fields.fileName}" updated.` }
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to update commission. Please try again.',
    }
  }
}

export async function deleteCommissionAction(id: number): Promise<FormState> {
  ensureWritable()

  try {
    const { imageMapChanged } = deleteCommission(id)
    revalidatePublicViews()
    revalidatePath('/admin')
    if (imageMapChanged) {
      await runImageImportPipeline()
    }
    return { status: 'success', message: 'Commission deleted.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to delete commission.',
    }
  }
}

export async function deleteCharacterAction(id: number): Promise<FormState> {
  ensureWritable()

  try {
    const { imageMapChanged } = deleteCharacter(id)
    revalidatePublicViews()
    revalidatePath('/admin')
    if (imageMapChanged) {
      await runImageImportPipeline()
    }
    return { status: 'success', message: 'Character deleted.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to delete character.',
    }
  }
}
