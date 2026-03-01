'use client'

import { Button } from '#components/ui/button'
import { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

interface SubmitButtonProps {
  children: ReactNode
  pendingLabel?: string
}

const SubmitButton = ({ children, pendingLabel = 'Saving...' }: SubmitButtonProps) => {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="default" className="w-[150px] font-semibold" disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  )
}

export default SubmitButton
