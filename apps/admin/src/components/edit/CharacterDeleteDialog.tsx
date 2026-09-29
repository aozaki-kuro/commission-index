import type { RefObject } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

interface CharacterDeleteDialogProps {
  characterName: string
  commissionCount: number
  cancelButtonRef: RefObject<HTMLButtonElement | null>
  returnFocusRef: RefObject<HTMLElement | null>
  isDeletePending: boolean
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

export function CharacterDeleteDialog({
  characterName,
  commissionCount,
  cancelButtonRef,
  returnFocusRef,
  isDeletePending,
  isOpen,
  onClose,
  onConfirm,
}: CharacterDeleteDialogProps) {
  const closeDialog = () => {
    if (isDeletePending) {
      return
    }

    onClose()
    window.setTimeout(() => returnFocusRef.current?.focus(), 0)
  }

  const closeWhenIdle = (open: boolean) => {
    if (!open && !isDeletePending) {
      closeDialog()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={closeWhenIdle}>
      <DialogContent
        role="alertdialog"
        aria-modal="true"
        variant="alert"
        className="max-w-md p-6"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelButtonRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (isDeletePending) {
            event.preventDefault()
          }
        }}
        onPointerDownOutside={(event) => {
          if (isDeletePending) {
            event.preventDefault()
          }
        }}
      >
        <DialogTitle
          className="text-lg font-bold text-gray-900 dark:text-gray-100"
        >
          Delete character?
        </DialogTitle>

        <div className="mt-2 space-y-2">
          <DialogDescription>
            This will remove the character and all associated commissions. This action cannot be
            undone.
          </DialogDescription>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">{characterName}</span>
            {' '}
            has
            {' '}
            <span className="font-mono">{commissionCount}</span>
            {' '}
            entr
            {commissionCount === 1 ? 'y' : 'ies'}
            .
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={closeDialog}
            disabled={isDeletePending}
            className="
              inline-flex h-10 items-center justify-center rounded-md border
              border-gray-300 px-4 text-sm font-medium text-gray-700 transition
              hover:bg-gray-50
              focus-visible:ring-2 focus-visible:ring-gray-400
              focus-visible:ring-offset-2 focus-visible:ring-offset-white
              focus-visible:outline-none
              disabled:cursor-not-allowed disabled:opacity-60
              dark:border-gray-700 dark:text-gray-200
              dark:hover:bg-gray-900/40
              dark:focus-visible:ring-offset-gray-900
            "
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeletePending}
            className="
              inline-flex h-10 items-center justify-center rounded-md bg-red-600
              px-4 text-sm font-semibold text-white transition
              hover:bg-red-500
              focus-visible:ring-2 focus-visible:ring-red-400
              focus-visible:ring-offset-2 focus-visible:ring-offset-white
              focus-visible:outline-none
              disabled:cursor-not-allowed disabled:opacity-60
              dark:focus-visible:ring-offset-gray-900
            "
          >
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
