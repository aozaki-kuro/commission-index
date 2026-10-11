import type {
  AdminCommissionSearchRow,
  CharacterRow,
  CreatorAliasRow,
} from '@commission-index/domain'
import { CommissionManager } from './edit/CommissionManager'

interface AdminEditDashboardProps {
  characters: CharacterRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
  creatorAliases: CreatorAliasRow[]
  isInitialLoading: boolean
  isInitialError: boolean
  onOpenGroupsLoaded: () => void
  onRefresh: () => void
  refreshScope?: ReadonlySet<number> | null
}

export function AdminEditDashboard({
  characters,
  commissionSearchRows,
  creatorAliases,
  isInitialLoading,
  isInitialError,
  onOpenGroupsLoaded,
  onRefresh,
  refreshScope,
}: AdminEditDashboardProps) {
  return (
    <section className="space-y-4">
      <CommissionManager
        characters={characters}
        commissionSearchRows={commissionSearchRows}
        creatorAliases={creatorAliases}
        isInitialLoading={isInitialLoading}
        isInitialError={isInitialError}
        onOpenGroupsLoaded={onOpenGroupsLoaded}
        onRefresh={onRefresh}
        refreshScope={refreshScope}
      />
    </section>
  )
}
