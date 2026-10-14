import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

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
      className="
        inline-flex min-h-11 min-w-[150px] shrink-0 items-center justify-center rounded-md
        bg-gray-900 px-3 text-sm font-semibold whitespace-nowrap text-white
        transition
        hover:bg-gray-700
        focus-visible:ring-2 focus-visible:ring-gray-400
        focus-visible:ring-offset-2 focus-visible:ring-offset-white
        focus-visible:outline-none
        active:scale-[0.97]
        disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-100
        disabled:pointer-events-none
        dark:bg-gray-100 dark:text-gray-900
        dark:hover:bg-gray-200
        dark:disabled:bg-gray-800 dark:disabled:text-gray-500
        dark:focus-visible:ring-offset-gray-900
      "
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
