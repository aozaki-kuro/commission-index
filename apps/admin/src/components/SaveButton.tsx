import { useFormStatus } from 'react-dom'

interface SaveButtonProps {
  label: string
}

export function SaveButton({ label }: SaveButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="
        inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gray-900
        px-3 text-sm font-medium whitespace-nowrap text-white transition
        hover:bg-gray-700
        focus-visible:ring-2 focus-visible:ring-gray-400
        focus-visible:ring-offset-2 focus-visible:ring-offset-white
        focus-visible:outline-none
        active:scale-[0.97]
        disabled:pointer-events-none disabled:opacity-50
        dark:bg-gray-100 dark:text-gray-900
        dark:hover:bg-gray-200
        dark:focus-visible:ring-offset-gray-900
      "
    >
      {pending ? 'Saving...' : label}
    </button>
  )
}
