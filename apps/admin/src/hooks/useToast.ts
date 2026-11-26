import { createContext, use } from 'react'

export type NoticeTone = 'neutral' | 'success' | 'error' | 'warning'

export interface ToastOptions {
  id?: string
  message: string
  tone?: NoticeTone
  /** Auto-dismiss delay in ms. Defaults to 2500; pass 0 to persist until dismissed. */
  durationMs?: number
}

export interface ToastActions {
  push: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const noopToastActions: ToastActions = {
  push: options => options.id ?? '',
  dismiss: () => {},
}

export const ToastActionsContext = createContext<ToastActions>(noopToastActions)

export function useToast() {
  return use(ToastActionsContext)
}
