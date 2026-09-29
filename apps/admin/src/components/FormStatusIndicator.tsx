import type { FormStatus } from '../lib/formState'
import { IconCheck } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { FloatingNotice } from './FloatingNotice'

interface FormStatusIndicatorProps {
  status: FormStatus
  message?: string
  successLabel?: string
  errorFallback?: string
  hideDelay?: number
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
  hideDelay = 2500,
}: FormStatusIndicatorProps) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (status !== 'success') {
      return
    }
    const timer = setTimeout(setDismissed, hideDelay, true)
    return () => clearTimeout(timer)
  }, [status, hideDelay])

  if (dismissed) {
    return null
  }

  return (
    <FloatingNotice tone={status === 'error' ? 'error' : 'success'} onDismiss={() => setDismissed(true)}>
      {status === 'error'
        ? (
            <details>
              <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
                {errorFallback}
                <span className="ml-1 text-xs underline underline-offset-2">Details</span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-xs">{message ?? errorFallback}</p>
            </details>
          )
        : (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <IconCheck className="size-3.5" stroke={1.8} aria-hidden="true" />
              {successLabel}
            </span>
          )}
    </FloatingNotice>
  )
}
