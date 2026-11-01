import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { buttonStyles } from '../app/ui'

interface SubmitButtonProps {
  children: ReactNode
  disabled?: boolean
  pendingLabel?: string
}

export function SubmitButton({
  children,
  disabled = false,
  pendingLabel = 'Saving...',
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${buttonStyles.primary} min-w-[150px] shrink-0 whitespace-nowrap`}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
