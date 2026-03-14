import type { AdminBootstrapData } from '#lib/admin/db'
import AddCharacterForm from '#admin/AddCharacterForm'
import AddCommissionForm from '#admin/AddCommissionForm'
import { useAdminBootstrap } from '#admin/hooks/useAdminBootstrap'

interface AdminCreateIslandProps {
  initialPayload?: AdminBootstrapData | null
}

function AdminCreateIsland({ initialPayload = null }: AdminCreateIslandProps) {
  const { payload, errorMessage, isLoading, reload } = useAdminBootstrap<AdminBootstrapData>({
    initialPayload,
    errorFallback: 'Failed to load admin data.',
    subscribeUpdates: true,
  })

  if (!payload && errorMessage) {
    return (
      <div>
        <p className="text-sm text-red-300">{errorMessage}</p>
        <button
          className="
            mt-3 inline-flex rounded-md border border-zinc-500 px-3 py-1 text-sm
            hover:border-zinc-300
          "
          onClick={reload}
          type="button"
        >
          Retry
        </button>
      </div>
    )
  }

  if (isLoading) {
    return <p>Loading admin data...</p>
  }

  if (!payload) {
    return (
      <div>
        <p className="text-sm text-red-300">Admin data is unavailable.</p>
        <button
          className="
            mt-3 inline-flex rounded-md border border-zinc-500 px-3 py-1 text-sm
            hover:border-zinc-300
          "
          onClick={reload}
          type="button"
        >
          Retry
        </button>
      </div>
    )
  }

  const characterOptions = payload.characters.map(character => ({
    id: character.id,
    name: character.name,
    status: character.status,
    sortOrder: character.sortOrder,
  }))

  return (
    <section className="space-y-4">
      <AddCharacterForm />
      <AddCommissionForm characters={characterOptions} />
    </section>
  )
}

export default AdminCreateIsland
