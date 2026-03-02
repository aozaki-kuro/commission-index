import type { FormState } from './types'

export type AdminApiResponse = {
  status: 'success' | 'error'
  message: string
}

const toErrorState = (error: unknown, fallback: string): FormState => ({
  status: 'error',
  message: error instanceof Error ? error.message : fallback,
})

const parseResponse = async (response: Response): Promise<FormState> => {
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
  } catch {
    return {
      status: 'error',
      message: response.ok ? 'Failed to parse response.' : `Request failed (${response.status}).`,
    }
  }
}

export const addCharacterAction = async (
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> => {
  void _prevState
  try {
    const response = await fetch('/api/admin/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name')?.toString() ?? '',
        status: formData.get('status')?.toString() ?? 'active',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to create character.')
  }
}

export const addCommissionAction = async (
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> => {
  void _prevState
  try {
    const response = await fetch('/api/admin/commissions', {
      method: 'POST',
      body: formData,
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to add commission.')
  }
}

export const updateCommissionAction = async (
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> => {
  void _prevState
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return { status: 'error', message: 'Invalid commission identifier.' }
  }

  try {
    const response = await fetch(`/api/admin/commissions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        characterId: Number(formData.get('characterId')),
        fileName: formData.get('fileName')?.toString() ?? '',
        links: formData.get('links')?.toString() ?? '',
        design: formData.get('design')?.toString() ?? '',
        description: formData.get('description')?.toString() ?? '',
        keyword: formData.get('keyword')?.toString() ?? '',
        hidden: formData.get('hidden') === 'on',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to update commission.')
  }
}

export async function replaceCommissionSourceImageAction(formData: FormData): Promise<FormState> {
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return { status: 'error', message: 'Invalid commission identifier.' }
  }

  try {
    const response = await fetch(`/api/admin/commissions/${id}/source-image`, {
      method: 'POST',
      body: formData,
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to replace source image.')
  }
}

export async function saveCharacterOrder(payload: {
  active: number[]
  stale: number[]
}): Promise<FormState> {
  try {
    const response = await fetch('/api/admin/characters/order', {
      method: 'PUT',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to update character order.')
  }
}

export async function renameCharacter(payload: {
  id: number
  name: string
  status: 'active' | 'stale'
}): Promise<FormState> {
  try {
    const response = await fetch(`/api/admin/characters/${payload.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to update character.')
  }
}

export async function deleteCommissionAction(id: number): Promise<FormState> {
  try {
    const response = await fetch(`/api/admin/commissions/${id}`, {
      method: 'DELETE',
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to delete commission.')
  }
}

export async function deleteCharacterAction(id: number): Promise<FormState> {
  try {
    const response = await fetch(`/api/admin/characters/${id}`, {
      method: 'DELETE',
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to delete character.')
  }
}

export const saveCreatorAliasesBatchAction = async (
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> => {
  void _prevState
  try {
    const response = await fetch('/api/admin/aliases/batch', {
      method: 'POST',
      body: JSON.stringify({
        rowsJson: formData.get('rowsJson')?.toString() ?? '[]',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return parseResponse(response)
  } catch (error) {
    return toErrorState(error, 'Failed to save aliases.')
  }
}
