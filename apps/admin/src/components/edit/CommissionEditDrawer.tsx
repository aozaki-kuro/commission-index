import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
} from '@commission-index/domain'
import type { RefObject } from 'react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { buttonStyles } from '../../app/ui'
import {
  formatCommissionPublicId,
  getCommissionAccessibleLabel,
  getCommissionTitle,
} from '../../lib/commissionPresentation'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { CommissionEditForm } from './CommissionEditForm'

/** Runs `action` now when the draft is clean, otherwise only after the user confirms discarding it. */
export type DiscardGuard = (action: () => void) => void

interface CommissionEditDrawerProps {
  characters: CharacterRow[]
  commission: CommissionRow | null
  commissionSearchRows: AdminCommissionSearchRow[]
  /** Lets the owner route other draft-discarding actions (switching records) through the same confirmation. */
  discardGuardRef?: RefObject<DiscardGuard | null>
  onClose: () => void
  onDelete: () => void
  onSaveSuccess: (updated: CommissionRow) => void
  open: boolean
}

export function CommissionEditDrawer({
  characters,
  commission,
  commissionSearchRows,
  discardGuardRef,
  onClose,
  onDelete,
  onSaveSuccess,
  open,
}: CommissionEditDrawerProps) {
  const isDirtyRef = useRef(false)
  const keepEditingButtonRef = useRef<HTMLButtonElement | null>(null)
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null)
  const handleDirtyChange = useCallback((isDirty: boolean) => {
    isDirtyRef.current = isDirty
  }, [])
  const openRef = useRef(open)
  openRef.current = open
  const guardDiscard = useCallback<DiscardGuard>((action) => {
    if (openRef.current && isDirtyRef.current) {
      setPendingDiscard(() => action)
      return
    }
    action()
  }, [])
  useLayoutEffect(() => {
    if (!discardGuardRef)
      return
    discardGuardRef.current = guardDiscard
    return () => {
      if (discardGuardRef.current === guardDiscard)
        discardGuardRef.current = null
    }
  }, [discardGuardRef, guardDiscard])

  // 关闭动画期间保留上一次的 commission 数据，防止内容塌缩
  const lastCommissionRef = useRef<CommissionRow | null>(null)
  if (commission) {
    lastCommissionRef.current = commission
  }
  const displayCommission = commission ?? lastCommissionRef.current

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen)
            guardDiscard(onClose)
        }}
      >
        <DialogContent variant="sheet" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle
              aria-label={displayCommission
                ? getCommissionAccessibleLabel(displayCommission)
                : undefined}
              title={displayCommission?.publicId}
            >
              <span className="
              block truncate text-base font-semibold text-gray-900
              dark:text-gray-100
            "
              >
                {displayCommission
                  ? getCommissionTitle(displayCommission)
                  : ''}
              </span>
              <span className="mt-1 flex min-w-0 items-baseline justify-between gap-3 text-sm font-normal text-gray-500 dark:text-gray-400">
                <span className="truncate">{displayCommission?.characterName ?? ''}</span>
                {displayCommission && (
                  <span
                    data-commission-public-id={displayCommission.publicId}
                    title={`Public UUID ${displayCommission.publicId}`}
                    aria-label={`Public UUID ${displayCommission.publicId}`}
                    className="shrink-0 text-xs tabular-nums"
                  >
                    #
                    {formatCommissionPublicId(displayCommission.publicId)}
                  </span>
                )}
              </span>
            </DialogTitle>
            <DialogCloseButton />
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {displayCommission && (
              <CommissionEditForm
                key={displayCommission.id}
                characters={characters}
                commission={displayCommission}
                commissionSearchRows={commissionSearchRows}
                onDelete={onDelete}
                onDirtyChange={handleDirtyChange}
                onSaveSuccess={onSaveSuccess}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pendingDiscard !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen)
            setPendingDiscard(null)
        }}
      >
        <DialogContent
          role="alertdialog"
          aria-modal="true"
          variant="alert"
          className="max-w-md p-6"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            keepEditingButtonRef.current?.focus()
          }}
        >
          <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Discard unsaved changes?
          </DialogTitle>
          <DialogDescription className="mt-2">
            Your edits to this commission have not been saved.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-3">
            <button
              ref={keepEditingButtonRef}
              type="button"
              onClick={() => setPendingDiscard(null)}
              className={buttonStyles.secondary}
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                const action = pendingDiscard
                setPendingDiscard(null)
                action?.()
              }}
              className={buttonStyles.danger}
            >
              Discard
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
