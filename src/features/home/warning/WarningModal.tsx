import { Button } from '#components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '#components/ui/alert-dialog'
import { type RefObject } from 'react'
import { getHomeLocaleMessages, normalizeHomeLocale } from '#features/home/i18n/homeLocale'

const WarningMark = '/favicon-transparent.svg'
const WARNING_MARK_SIZE = 88

type WarningModalProps = {
  locale?: string
  isOpen: boolean
  confirmButtonRef: RefObject<HTMLButtonElement | null>
  onConfirm: () => void
  onLeave: () => void
}

export default function WarningModal({
  locale,
  isOpen,
  confirmButtonRef,
  onConfirm,
  onLeave,
}: WarningModalProps) {
  const messages = getHomeLocaleMessages(normalizeHomeLocale(locale))

  return (
    <AlertDialog open={isOpen} onOpenChange={() => {}}>
      <AlertDialogContent
        overlayClassName="bg-black/25 backdrop-blur-xl dark:bg-white/5 data-[state=open]:animate-[dialog-overlay-in_300ms_ease-out] data-[state=closed]:animate-[dialog-overlay-out_200ms_ease-in]"
        className="w-full max-w-md overflow-hidden rounded-2xl border-none bg-white p-6 text-left shadow-xl data-[state=closed]:animate-[dialog-content-out_200ms_ease-in] data-[state=open]:animate-[dialog-content-in_300ms_ease-out] dark:bg-gray-950"
        onEscapeKeyDown={event => event.preventDefault()}
        onOpenAutoFocus={event => {
          event.preventDefault()
          confirmButtonRef.current?.focus()
        }}
      >
        <div className="flex items-center justify-center">
          <img
            src={WarningMark}
            alt="Commission Index mark"
            loading="eager"
            decoding="async"
            width={WARNING_MARK_SIZE}
            height={WARNING_MARK_SIZE}
            className="select-none"
          />
        </div>
        <AlertDialogTitle className="text-center text-lg leading-6 font-bold text-gray-900 select-none dark:text-gray-300">
          {messages.warning.title}
        </AlertDialogTitle>
        <AlertDialogDescription className="sr-only">
          {messages.warning.srDescription}
        </AlertDialogDescription>
        <div className="mt-2">
          <p className="text-center text-sm text-gray-500 select-none dark:text-gray-400">
            {messages.warning.contentLine1}
            <br />
            {messages.warning.contentLine2}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-center">
          <AlertDialogAction asChild>
            <Button
              ref={confirmButtonRef}
              type="button"
              variant="outline"
              size="sm"
              className="border-transparent bg-blue-100 px-4 font-mono text-xs font-medium text-blue-900 select-none hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:hover:bg-blue-900/55"
              onClick={onConfirm}
            >
              {messages.warning.confirmAge}
            </Button>
          </AlertDialogAction>
          <div className="mx-3" />
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-transparent bg-red-100 px-4 font-mono text-xs font-medium text-red-900 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/55"
              onClick={onLeave}
            >
              {messages.warning.leaveNow}
            </Button>
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
