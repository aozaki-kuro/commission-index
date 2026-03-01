'use client'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#components/ui/dialog'
import { type RefObject } from 'react'

interface CharacterDeleteDialogProps {
  isOpen: boolean
  characterName: string
  commissionCount: number
  isDeletePending: boolean
  confirmButtonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onConfirm: () => void
}

const CharacterDeleteDialog = ({
  isOpen,
  characterName,
  commissionCount,
  isDeletePending,
  confirmButtonRef,
  onClose,
  onConfirm,
}: CharacterDeleteDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent
        className="w-full max-w-md overflow-hidden rounded-2xl border-none bg-white p-6 text-left shadow-xl data-[state=closed]:animate-[dialog-content-out_150ms_ease-in] data-[state=open]:animate-[dialog-content-in_200ms_ease-out] dark:bg-gray-950"
        onOpenAutoFocus={event => {
          event.preventDefault()
          confirmButtonRef.current?.focus()
        }}
      >
        <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
          Delete character?
        </DialogTitle>
        <div className="mt-2 space-y-2">
          <DialogDescription className="text-sm text-gray-600 dark:text-gray-300">
            This will remove the character and all associated commissions. This action cannot be
            undone.
          </DialogDescription>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            <span className="font-semibold">{characterName}</span> has{' '}
            <span className="font-mono">{commissionCount}</span> entr
            {commissionCount === 1 ? 'y' : 'ies'}.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:ring-offset-gray-900"
            onClick={onClose}
            disabled={isDeletePending}
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-70 dark:bg-red-500 dark:hover:bg-red-400 dark:focus-visible:ring-offset-gray-900"
            onClick={onConfirm}
            disabled={isDeletePending}
          >
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CharacterDeleteDialog
