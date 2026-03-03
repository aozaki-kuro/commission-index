export type FormStatus = 'idle' | 'success' | 'error'

export interface FormState {
  status: FormStatus
  message?: string
}

export const INITIAL_FORM_STATE: FormState = { status: 'idle' }
