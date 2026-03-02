'use client'

import { useEffect, useState } from 'react'

import type { FormStatus } from './types'

interface FormStatusIndicatorProps {
  status: FormStatus
  message?: string
  successLabel?: string
  errorFallback?: string
  hideDelay?: number
}

const FormStatusIndicator = ({
  status,
  message,
  successLabel = 'Saved',
  errorFallback = 'Unable to save.',
  hideDelay = 2500,
}: FormStatusIndicatorProps) => {
  const [visibleStatus, setVisibleStatus] = useState<FormStatus>('idle')

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    if (status === 'success') {
      showTimer = setTimeout(() => setVisibleStatus('success'), 0)
      hideTimer = setTimeout(() => setVisibleStatus('idle'), hideDelay)
    } else if (status === 'error') {
      showTimer = setTimeout(() => setVisibleStatus('error'), 0)
    } else {
      showTimer = setTimeout(() => setVisibleStatus('idle'), 0)
    }

    return () => {
      if (showTimer) clearTimeout(showTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [status, hideDelay])

  if (visibleStatus === 'idle') return null

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
      className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"
      aria-live="polite"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
      {text}
    </span>
  )
}

export default FormStatusIndicator
