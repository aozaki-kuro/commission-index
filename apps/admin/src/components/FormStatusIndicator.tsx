import type { FormStatus } from '../lib/formState'
import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useToast } from '../hooks/useToast'
import { FloatingNotice } from './FloatingNotice'

interface FormStatusIndicatorProps {
  status: FormStatus
  message?: string
  successLabel?: string
  errorFallback?: string
}

export function FormStatusIndicator({ status, message, ...props }: FormStatusIndicatorProps) {
  const { pending } = useFormStatus()
  if (status === 'idle' || pending) {
    return null
  }

  return <FormNotice key={`${status}:${message ?? ''}`} status={status} message={message} {...props} />
}

function FormNotice({
  status,
  message,
  successLabel = 'Saved',
  errorFallback = 'Unable to save.',
}: FormStatusIndicatorProps) {
  const [dismissed, setDismissed] = useState(false)
  const { push } = useToast()

  useEffect(() => {
    if (status !== 'success') {
      return
    }
    push({
      id: `form-success:${successLabel}`,
      tone: 'success',
      message: successLabel,
      durationMs: 2500,
    })
  }, [push, status, successLabel])

  if (status !== 'error' || dismissed) {
    return null
  }

  return (
    <FloatingNotice
      tone="error"
      onDismiss={() => setDismissed(true)}
    >
      <details>
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
          {errorFallback}
          <span className="ml-1 text-xs underline underline-offset-2">Details</span>
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-xs text-inherit">{message ?? errorFallback}</p>
      </details>
    </FloatingNotice>
  )
}
