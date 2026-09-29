import type { CharacterStatus, CommissionRow } from '@commission-index/domain'
import type { FormState } from './formState'
import { getAdminApiUrl } from './adminApi'

export interface AdminApiResponse {
  status: 'success' | 'error'
  message: string
}

interface BatchSavePayload {
  rows: unknown[]
}

function toErrorState(error: unknown, fallback: string): FormState {
  return {
    status: 'error',
    message: error instanceof Error ? error.message : fallback,
  }
}

function parseJsonFormField<T>(formData: FormData, fieldName: string, fallback: T): T {
  try {
    const raw = formData.get(fieldName)?.toString() ?? ''
    if (!raw) {
      return fallback
    }

    return JSON.parse(raw) as T
  }
  catch {
    return fallback
  }
}

async function parseResponse(response: Response): Promise<FormState> {
  try {
    const payload = (await response.json()) as Partial<AdminApiResponse> | null
    if (!payload || (payload.status !== 'success' && payload.status !== 'error')) {
      return {
        status: 'error',
        message: response.ok
          ? 'Unexpected response payload.'
          : `Request failed (${response.status}).`,
      }
    }

    return {
      status: payload.status,
      message: payload.message ?? (payload.status === 'success' ? 'Saved.' : 'Request failed.'),
    }
  }
  catch {
    return {
      status: 'error',
      message: response.ok ? 'Failed to parse response.' : `Request failed (${response.status}).`,
    }
  }
}

async function postAdminJson(pathname: string, payload: unknown) {
  const response = await fetch(getAdminApiUrl(pathname), {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return parseResponse(response)
}

async function sendAdminJson(
  pathname: string,
  method: 'PATCH' | 'POST' | 'PUT',
  payload: unknown,
) {
  const response = await fetch(getAdminApiUrl(pathname), {
    method,
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return parseResponse(response)
}

async function sendAdminRequest(pathname: string, method: 'DELETE' | 'POST') {
  const response = await fetch(getAdminApiUrl(pathname), {
    method,
  })

  return parseResponse(response)
}

async function saveAliasesBatchAction(
  pathname: string,
  fallback: string,
  formData: FormData,
): Promise<FormState> {
  try {
    return postAdminJson(pathname, {
      rows: parseJsonFormField<BatchSavePayload['rows']>(formData, 'rowsJson', []),
    })
  }
  catch (error) {
    return toErrorState(error, fallback)
  }
}

export async function addCharacterAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prevState

  try {
    return postAdminJson('/api/admin/characters', {
      name: formData.get('name')?.toString() ?? '',
      status: formData.get('status')?.toString() ?? 'active',
    })
  }
  catch (error) {
    return toErrorState(error, 'Failed to create character.')
  }
}

export async function addCommissionAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prevState

  try {
    formData.set('commissionDate', formData.get('commissionDate')?.toString().trim() ?? '')
    formData.set('creatorName', formData.get('creatorName')?.toString().trim() ?? '')
    formData.delete('fileName')
    const response = await fetch(getAdminApiUrl('/api/admin/commissions'), {
      method: 'POST',
      body: formData,
    })

    return parseResponse(response)
  }
  catch (error) {
    return toErrorState(error, 'Failed to add commission.')
  }
}

export async function updateCommissionAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prevState

  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return {
      status: 'error',
      message: 'Invalid commission identifier.',
    }
  }

  try {
    return sendAdminJson(`/api/admin/commissions/${id}`, 'PATCH', {
      characterId: Number(formData.get('characterId')),
      commissionDate: formData.get('commissionDate')?.toString().trim() || null,
      creatorName: formData.get('creatorName')?.toString().trim() || null,
      workGroupId: formData.get('workGroupId')?.toString().trim() || null,
      partNumber: formData.get('partNumber')?.toString().trim()
        ? Number(formData.get('partNumber'))
        : null,
      links: formData.get('links')?.toString() ?? '',
      design: formData.get('design')?.toString() ?? '',
      description: formData.get('description')?.toString() ?? '',
      keyword: formData.get('keyword')?.toString() ?? '',
      hidden: formData.get('hidden') === 'on',
    })
  }
  catch (error) {
    return toErrorState(error, 'Failed to update commission.')
  }
}

export async function replaceCommissionSourceImageAction(formData: FormData): Promise<FormState> {
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return {
      status: 'error',
      message: 'Invalid commission identifier.',
    }
  }

  try {
    formData.delete('commissionFileName')
    const response = await fetch(getAdminApiUrl(`/api/admin/commissions/${id}/source-image`), {
      method: 'POST',
      body: formData,
    })

    return parseResponse(response)
  }
  catch (error) {
    return toErrorState(error, 'Failed to replace source image.')
  }
}

export async function saveCharacterOrder(payload: {
  active: number[]
  archived: number[]
}): Promise<FormState> {
  try {
    return sendAdminJson('/api/admin/characters/order', 'PUT', payload)
  }
  catch (error) {
    return toErrorState(error, 'Failed to update character order.')
  }
}

export async function renameCharacter(payload: {
  id: number
  name: string
  status: CharacterStatus
}): Promise<FormState> {
  try {
    return sendAdminJson(`/api/admin/characters/${payload.id}`, 'PATCH', payload)
  }
  catch (error) {
    return toErrorState(error, 'Failed to update character.')
  }
}

export async function deleteCommissionAction(id: number): Promise<FormState> {
  try {
    return sendAdminRequest(`/api/admin/commissions/${id}`, 'DELETE')
  }
  catch (error) {
    return toErrorState(error, 'Failed to delete commission.')
  }
}

export async function deleteCharacterAction(id: number): Promise<FormState> {
  try {
    return sendAdminRequest(`/api/admin/characters/${id}`, 'DELETE')
  }
  catch (error) {
    return toErrorState(error, 'Failed to delete character.')
  }
}

export async function saveCreatorAliasesBatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prevState

  return saveAliasesBatchAction('/api/admin/aliases/batch', 'Failed to save aliases.', formData)
}

export async function saveCharacterAliasesBatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prevState

  return saveAliasesBatchAction(
    '/api/admin/character-aliases/batch',
    'Failed to save character aliases.',
    formData,
  )
}

export async function saveKeywordAliasesBatchAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prevState

  return saveAliasesBatchAction(
    '/api/admin/keyword-aliases/batch',
    'Failed to save keyword aliases.',
    formData,
  )
}

export async function saveHomeFeaturedKeywordsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  void _prevState

  try {
    return postAdminJson('/api/admin/suggestion', {
      keywords: parseJsonFormField(formData, 'keywordsJson', []),
    })
  }
  catch (error) {
    return toErrorState(error, 'Failed to save featured keywords.')
  }
}

export async function fetchCharacterCommissionsAction(
  characterId: number,
): Promise<CommissionRow[]> {
  if (!Number.isFinite(characterId) || characterId <= 0) {
    throw new Error('Invalid character identifier.')
  }

  const response = await fetch(getAdminApiUrl(`/api/admin/characters/${characterId}/commissions`), {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to load commissions (${response.status}).`)
  }

  const payload = (await response.json()) as { commissions?: CommissionRow[] } | null
  if (!payload || !Array.isArray(payload.commissions)) {
    throw new Error('Invalid commissions payload.')
  }

  return payload.commissions
}
