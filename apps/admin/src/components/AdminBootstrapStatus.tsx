import { useState } from 'react'
import { FloatingNotice } from './FloatingNotice'

interface AdminBootstrapStatusProps {
  errorMessage: string | null
  isLoading: boolean
  hasPayload: boolean
  onRetry: () => void
}

export function AdminBootstrapStatus(props: AdminBootstrapStatusProps) {
  if (!props.errorMessage) {
    return null
  }

  return <BootstrapError key={props.errorMessage} {...props} />
}

function BootstrapError({ errorMessage, isLoading, hasPayload, onRetry }: AdminBootstrapStatusProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) {
    return null
  }

  return (
    <FloatingNotice tone="error" onDismiss={() => setDismissed(true)}>
      <details>
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
          {hasPayload ? 'Refresh failed. Showing saved data.' : 'Admin data could not be loaded.'}
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-xs">{errorMessage}</p>
      </details>
      <button
        type="button"
        onClick={onRetry}
        disabled={isLoading}
        className="mt-2 rounded-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {isLoading ? 'Retrying…' : 'Try again'}
      </button>
    </FloatingNotice>
  )
}
