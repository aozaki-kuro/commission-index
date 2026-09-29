import type {
  AdminCommissionSearchRow,
  CharacterStatus,
} from '@commission-index/domain'
import { useCallback, useState } from 'react'
import { AdminBootstrapStatus } from './AdminBootstrapStatus'
import { AddCharacterForm } from './create/AddCharacterForm'
import { AddCommissionForm } from './create/AddCommissionForm'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

interface CharacterOption {
  id: number
  name: string
  status: CharacterStatus
  sortOrder: number
}

interface AdminCreateDashboardProps {
  characters: CharacterOption[]
  commissionSearchRows: AdminCommissionSearchRow[]
  errorMessage: string | null
  isLoading: boolean
  hasPayload: boolean
  onRetry: () => void
}

export function AdminCreateDashboard({
  characters,
  commissionSearchRows,
  errorMessage,
  isLoading,
  hasPayload,
  onRetry,
}: AdminCreateDashboardProps) {
  const [isCharacterDialogOpen, setIsCharacterDialogOpen] = useState(false)
  const [isSavingCharacter, setIsSavingCharacter] = useState(false)
  const handleCharacterSaved = useCallback(() => {
    setIsCharacterDialogOpen(false)
    onRetry()
  }, [onRetry])

  return (
    <section className="min-w-0">
      <AdminBootstrapStatus
        errorMessage={errorMessage}
        isLoading={isLoading}
        hasPayload={hasPayload}
        onRetry={onRetry}
      />
      <div className="motion-safe:animate-[tabFade_300ms_cubic-bezier(0.25,1,0.5,1)_both]">
        <AddCommissionForm
          characters={characters}
          commissionSearchRows={commissionSearchRows}
          bootstrapState={hasPayload ? 'ready' : isLoading ? 'loading' : 'unavailable'}
          onAddCharacter={() => setIsCharacterDialogOpen(true)}
        />
      </div>
      <Dialog
        open={isCharacterDialogOpen}
        onOpenChange={(open) => {
          if (!isSavingCharacter)
            setIsCharacterDialogOpen(open)
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">New character</DialogTitle>
            <DialogCloseButton disabled={isSavingCharacter} />
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto">
            <AddCharacterForm onSaved={handleCharacterSaved} onPendingChange={setIsSavingCharacter} />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
