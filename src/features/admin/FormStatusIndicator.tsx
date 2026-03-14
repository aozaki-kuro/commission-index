import type { FormStatus } from './types'
import { IconCheck } from '@tabler/icons-react'

import { useEffect, useState } from 'react'

interface FormStatusIndicatorProps {
  status: FormStatus
  message?: string
  successLabel?: string
  errorFallback?: string
  hideDelay?: number
}

function FormStatusIndicator({
  status,
  message,
  successLabel = 'Saved',
  errorFallback = 'Unable to save.',
  hideDelay = 2500,
}: FormStatusIndicatorProps) {
  const [visibleStatus, setVisibleStatus] = useState<FormStatus>('idle')

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    if (status === 'success') {
      showTimer = setTimeout(setVisibleStatus, 0, 'success')
      hideTimer = setTimeout(setVisibleStatus, hideDelay, 'idle')
    }
    else if (status === 'error') {
      showTimer = setTimeout(setVisibleStatus, 0, 'error')
    }
    else {
      showTimer = setTimeout(setVisibleStatus, 0, 'idle')
    }

    return () => {
      if (showTimer)
        clearTimeout(showTimer)
      if (hideTimer)
        clearTimeout(hideTimer)
    }
  }, [status, hideDelay])

  if (visibleStatus === 'idle')
    return null

  const isError = visibleStatus === 'error'
  const text = isError ? (message ?? errorFallback) : successLabel

  if (isError) {
    return (
      <span className="text-sm text-red-500" aria-live="polite">
        {text}
      </span>
    )
  }

  return (
    <span
      className="
        inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600
        dark:text-emerald-400
      "
      aria-live="polite"
    >
      <IconCheck className="size-3.5" stroke={1.8} aria-hidden="true" />
      {text}
    </span>
  )
}

export default FormStatusIndicator
