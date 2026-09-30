import type { ReactNode } from 'react'
import { IconX } from '@tabler/icons-react'
import { createContext, use, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

const NoticeViewportContext = createContext<HTMLDivElement | null>(null)

const toneClasses = {
  neutral: 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200',
  success: 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  error: 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300',
  warning: 'border-amber-200 text-amber-800 dark:border-amber-900 dark:text-amber-200',
}

export function FloatingNoticeProvider({
  children,
  local = false,
}: {
  children: ReactNode
  local?: boolean
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)

  return (
    <NoticeViewportContext value={viewport}>
      {children}
      <div
        ref={setViewport}
        data-notice-viewport={local ? 'dialog' : 'page'}
        className={cn(
          'pointer-events-none right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-sm flex-col items-stretch gap-2',
          local ? 'absolute z-10' : 'fixed z-40',
        )}
      />
    </NoticeViewportContext>
  )
}

export function FloatingNotice({
  children,
  tone = 'neutral',
  onDismiss,
}: {
  children: ReactNode
  tone?: keyof typeof toneClasses
  onDismiss?: () => void
}) {
  const viewport = use(NoticeViewportContext)
  if (!viewport || !children) {
    return null
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'admin-glass pointer-events-auto flex min-h-0 items-start gap-3 overflow-y-auto rounded-xl border px-4 py-3 text-sm shadow-lg',
        toneClasses[tone],
      )}
    >
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:hover:bg-white/10"
        >
          <IconX className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>,
    viewport,
  )
}
