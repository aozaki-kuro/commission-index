import type { AdminCommissionSearchRow, CharacterRow, CreatorAliasRow } from '#lib/admin/db'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs'
import AddCharacterForm from './AddCharacterForm'
import AddCommissionForm from './AddCommissionForm'
import CommissionManager from './CommissionManager'
import useStoredTabIndex from './hooks/useStoredTabIndex'

interface AdminDashboardProps {
  characters: CharacterRow[]
  creatorAliases: CreatorAliasRow[]
  commissionSearchRows: AdminCommissionSearchRow[]
  initialTabIndex?: number
}

const tabs = ['Create', 'Existing'] as const
const tabStorageKey = 'admin-dashboard-tab-index'

const AdminDashboard = ({
  characters,
  creatorAliases,
  commissionSearchRows,
  initialTabIndex,
}: AdminDashboardProps) => {
  const [selectedIndex, setSelectedIndex] = useStoredTabIndex(tabStorageKey, tabs.length, {
    initialIndex: initialTabIndex,
  })

  const characterOptions = characters.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    sortOrder: c.sortOrder,
  }))

  return (
    <div className="space-y-6">
      <Tabs
        value={tabs[selectedIndex]}
        onValueChange={value => {
          const nextIndex = tabs.indexOf(value as (typeof tabs)[number])
          if (nextIndex !== -1) setSelectedIndex(nextIndex)
        }}
      >
        <TabsList className="flex w-full gap-2 rounded-xl border border-gray-200 bg-white/80 p-1 text-sm font-medium shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/60">
          {tabs.map(tab => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="flex-1 rounded-lg px-4 py-2.5 text-center transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-gray-300 dark:hover:bg-gray-800/60 dark:focus-visible:ring-offset-gray-900 dark:data-[state=active]:bg-gray-100 dark:data-[state=active]:text-gray-900"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6 space-y-8">
          <TabsContent
            value="Create"
            className="animate-[tabFade_260ms_ease-out] focus:outline-none"
          >
            <div className="space-y-4">
              <AddCharacterForm />
              <AddCommissionForm characters={characterOptions} />
            </div>
          </TabsContent>

          <TabsContent value="Existing" className="focus:outline-none">
            <CommissionManager
              characters={characters}
              creatorAliases={creatorAliases}
              commissionSearchRows={commissionSearchRows}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

export default AdminDashboard
