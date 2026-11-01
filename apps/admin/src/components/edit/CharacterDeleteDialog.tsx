import type { RefObject } from 'react'
import { buttonStyles } from '../../app/ui'
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
            <span className="tabular-nums">{commissionCount}</span>
            {' '}
            entr
            {commissionCount === 1
              ? 'y'
              : 'ies'}
            .
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={closeDialog}
            disabled={isDeletePending}
            className={buttonStyles.secondary}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeletePending}
            className={buttonStyles.danger}
          >
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
