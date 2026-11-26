import type { ReactNode } from 'react'
import type { NoticeTone, ToastActions, ToastOptions } from '../hooks/useToast'
import { IconCheck, IconX } from '@tabler/icons-react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ToastActionsContext } from '../hooks/useToast'
import { cn } from '../lib/cn'

interface NoticeViewportContextValue {
  viewport: HTMLDivElement | null
  toastViewport: HTMLDivElement | null
  isLocal: boolean
  registerLocalSlot: (node: HTMLDivElement | null) => void
}

interface ToastItem {
  id: string
  message: string
  tone: NoticeTone
}

const NoticeViewportContext = createContext<NoticeViewportContextValue>({
  viewport: null,
  toastViewport: null,
  isLocal: false,
  registerLocalSlot: () => {},
})

const floatingToneClasses: Record<NoticeTone, string> = {
  neutral: 'border-gray-200 text-gray-700 dark:border-gray-800 dark:text-gray-200',
  success: 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  error: 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300',
  warning: 'border-amber-200 text-amber-800 dark:border-amber-900 dark:text-amber-200',
}

const inlineToneClasses: Record<NoticeTone, string> = {
  neutral: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-200',
  success: 'border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-900/80 dark:bg-emerald-950/45 dark:text-emerald-300',
  error: 'border-red-200 bg-red-50/90 text-red-700 dark:border-red-900/80 dark:bg-red-950/50 dark:text-red-300',
  warning: 'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900/80 dark:bg-amber-950/45 dark:text-amber-200',
}

const dismissButtonClasses
  = '-m-1 inline-flex size-8 pointer-coarse:-m-2.5 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:hover:bg-white/10'

function NoticeCard({
  children,
  tone,
  onDismiss,
  variant,
}: {
  children: ReactNode
  tone: NoticeTone
  onDismiss?: () => void
  variant: 'page' | 'toast' | 'dialog'
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        variant === 'dialog'
          ? 'flex min-h-0 max-h-48 items-start gap-3 overflow-y-auto border-t px-5 py-3 text-sm'
          : 'admin-glass pointer-events-auto flex min-h-0 max-w-full items-start gap-3 overflow-y-auto rounded-xl border px-4 py-3 text-sm shadow-xl',
        variant === 'toast' && 'motion-safe:animate-[toastIn_180ms_ease-out]',
        variant === 'dialog'
          ? inlineToneClasses[tone]
          : floatingToneClasses[tone],
      )}
    >
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className={dismissButtonClasses}
        >
          <IconX className="size-4" stroke={1.8} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** Places dialog-scoped notices immediately above a fixed footer so errors never cover action buttons. */
export function DialogNoticeSlot() {
  const { isLocal, registerLocalSlot } = use(NoticeViewportContext)
  if (!isLocal) {
    return null
  }

  return (
    <div
      ref={registerLocalSlot}
      data-notice-viewport="dialog"
      className="shrink-0 empty:hidden"
    />
  )
}

export function FloatingNoticeProvider({
  children,
  local = false,
}: {
  children: ReactNode
  local?: boolean
}) {
  const parentViewport = use(NoticeViewportContext)
  const parentToastActions = use(ToastActionsContext)
  const [fallbackViewport, setFallbackViewport] = useState<HTMLDivElement | null>(null)
  const [customLocalViewport, setCustomLocalViewport] = useState<HTMLDivElement | null>(null)
  const [toastViewport, setToastViewport] = useState<HTMLDivElement | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    const existingTimer = timersRef.current.get(id)
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer)
      timersRef.current.delete(id)
    }
    setToasts(current => current.filter(item => item.id !== id))
  }, [])

  const push = useCallback(({
    id,
    message,
    tone = 'success',
    durationMs = 2500,
  }: ToastOptions) => {
    const toastId = id ?? crypto.randomUUID()
    const existingTimer = timersRef.current.get(toastId)
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer)
      timersRef.current.delete(toastId)
    }
    setToasts((current) => {
      const next: ToastItem = { id: toastId, message, tone }
      const index = current.findIndex(item => item.id === toastId)
      if (index === -1) {
        return [...current, next]
      }
      return current.with(index, next)
    })
    if (durationMs > 0) {
      timersRef.current.set(toastId, window.setTimeout(dismiss, durationMs, toastId))
    }
    return toastId
  }, [dismiss])

  const toastActions = useMemo<ToastActions>(
    () => (local
      ? parentToastActions
      : { push, dismiss }),
    [
      dismiss,
      local,
      parentToastActions,
      push,
    ],
  )

  const registerLocalSlot = useCallback((node: HTMLDivElement | null) => {
    setCustomLocalViewport(node)
  }, [])

  const activeViewport = local
    ? (customLocalViewport ?? fallbackViewport)
    : fallbackViewport

  const activeToastViewport = local
    ? parentViewport.toastViewport
    : toastViewport

  const viewportContextValue = useMemo<NoticeViewportContextValue>(() => ({
    viewport: activeViewport,
    toastViewport: activeToastViewport,
    isLocal: local,
    registerLocalSlot,
  }), [
    activeToastViewport,
    activeViewport,
    local,
    registerLocalSlot,
  ])

  return (
    <ToastActionsContext value={toastActions}>
      <NoticeViewportContext value={viewportContextValue}>
        {children}
        {local
          ? (
              customLocalViewport === null && (
                <div
                  ref={setFallbackViewport}
                  data-notice-viewport="dialog"
                  className="shrink-0 empty:hidden"
                />
              )
            )
          : (
              <>
                <div
                  ref={setToastViewport}
                  data-notice-viewport="toast"
                  className="pointer-events-none fixed top-[max(1rem,env(safe-area-inset-top))] right-4 left-4 z-90 flex max-h-[calc(100%-2rem)] flex-col items-stretch gap-2 sm:left-auto sm:w-auto sm:min-w-56 sm:max-w-sm sm:items-end"
                >
                  {toasts.map(item => (
                    <NoticeCard
                      key={item.id}
                      tone={item.tone}
                      variant="toast"
                      onDismiss={() => dismiss(item.id)}
                    >
                      {item.tone === 'success'
                        ? (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <IconCheck className="size-3.5 shrink-0" stroke={1.8} aria-hidden="true" />
                              <span>{item.message}</span>
                            </span>
                          )
                        : item.message}
                    </NoticeCard>
                  ))}
                </div>
                <div
                  ref={setFallbackViewport}
                  data-notice-viewport="page"
                  className="pointer-events-none fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-sm flex-col items-stretch gap-2"
                />
              </>
            )}
      </NoticeViewportContext>
    </ToastActionsContext>
  )
}

export function FloatingNotice({
  children,
  tone = 'neutral',
  placement = 'default',
  onDismiss,
}: {
  children: ReactNode
  tone?: NoticeTone
  placement?: 'default' | 'toast'
  onDismiss?: () => void
}) {
  const { viewport, toastViewport, isLocal } = use(NoticeViewportContext)
  const target = placement === 'toast'
    ? (toastViewport ?? viewport)
    : viewport
  if (!target || !children) {
    return null
  }

  const variant = placement === 'toast'
    ? 'toast'
    : isLocal
      ? 'dialog'
      : 'page'

  return createPortal(
    <NoticeCard tone={tone} variant={variant} onDismiss={onDismiss}>
      {children}
    </NoticeCard>,
    target,
  )
}
