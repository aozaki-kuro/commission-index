import { Button } from '#components/ui/button'
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
          <Button type="button" variant="outline" onClick={onClose} disabled={isDeletePending}>
            Cancel
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="destructive"
            className="font-semibold disabled:opacity-70"
            onClick={onConfirm}
            disabled={isDeletePending}
          >
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CharacterDeleteDialog
