import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CommissionRow,
} from '@commission-index/domain'
import { useRef } from 'react'
import {
  getCommissionAccessibleLabel,
  getCommissionDisplayLabel,
} from '../../lib/commissionPresentation'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { CommissionEditForm } from './CommissionEditForm'

interface CommissionEditDrawerProps {
  characters: CharacterRow[]
  commission: CommissionRow | null
  commissionSearchRows: AdminCommissionSearchRow[]
  onClose: () => void
  onDelete: () => void
  onSaveSuccess: (updated: CommissionRow) => void
  open: boolean
}

export function CommissionEditDrawer({
  characters,
  commission,
  commissionSearchRows,
  onClose,
  onDelete,
  onSaveSuccess,
  open,
}: CommissionEditDrawerProps) {
  // 关闭动画期间保留上一次的 commission 数据，防止内容塌缩
  const lastCommissionRef = useRef<CommissionRow | null>(null)
  if (commission) {
    lastCommissionRef.current = commission
  }
  const displayCommission = commission ?? lastCommissionRef.current

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen)
          onClose()
      }}
    >
      <DialogContent variant="sheet" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle
            aria-label={displayCommission ? getCommissionAccessibleLabel(displayCommission) : undefined}
            title={displayCommission?.publicId}
          >
            <p className="
              truncate text-base font-semibold text-gray-900
              dark:text-gray-100
            "
            >
              {displayCommission ? getCommissionDisplayLabel(displayCommission) : ''}
            </p>
            <p className="
              truncate text-sm text-gray-500
              dark:text-gray-400
            "
            >
              {displayCommission?.characterName ?? ''}
            </p>
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
              onSaveSuccess={onSaveSuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
