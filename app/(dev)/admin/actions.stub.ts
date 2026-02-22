import type { FormState } from './types'

const disabledState: FormState = {
  status: 'error',
  message: 'Admin actions are only available in development mode.',
}

export const addCharacterAction = async (
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> => {
  void _prev
  void _formData
  return disabledState
}

export const addCommissionAction = async (
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> => {
  void _prev
  void _formData
  return disabledState
}

export const updateCommissionAction = async (
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> => {
  void _prev
  void _formData
  return disabledState
}

export async function saveCharacterOrder(_payload: {
  active: number[]
  stale: number[]
}): Promise<FormState> {
  void _payload
  return disabledState
}

export async function renameCharacter(_payload: {
  id: number
  name: string
  status: 'active' | 'stale'
}): Promise<FormState> {
  void _payload
  return disabledState
}

export async function deleteCommissionAction(_id: number): Promise<FormState> {
  void _id
  return disabledState
}

export async function deleteCharacterAction(_id: number): Promise<FormState> {
  void _id
  return disabledState
}

export const saveCreatorAliasesAction = async (
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> => {
  void _prev
  void _formData
  return disabledState
}

export const saveCreatorAliasesBatchAction = async (
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> => {
  void _prev
  void _formData
  return disabledState
}
