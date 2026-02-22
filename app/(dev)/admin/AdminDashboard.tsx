'use client'

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import type { CharacterRow, CommissionRow, CreatorAliasRow } from '#lib/admin/db'
import AddCharacterForm from './AddCharacterForm'
import AddCommissionForm from './AddCommissionForm'
import AdminLiveRefresh from './AdminLiveRefresh'
import CommissionManager from './CommissionManager'
import AdminSectionNav from './AdminSectionNav'
import useStoredTabIndex from './hooks/useStoredTabIndex'

interface AdminDashboardProps {
  characters: CharacterRow[]
  commissions: CommissionRow[]
  creatorAliases: CreatorAliasRow[]
}

const tabs = ['Create', 'Existing'] as const
const tabStorageKey = 'admin-dashboard-tab-index'

const AdminDashboard = ({ characters, commissions, creatorAliases }: AdminDashboardProps) => {
  const [selectedIndex, setSelectedIndex] = useStoredTabIndex(tabStorageKey, tabs.length)

  const characterOptions = characters.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    sortOrder: c.sortOrder,
  }))

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 pb-10 lg:px-0">
      <AdminLiveRefresh />
      <header className="space-y-2">
        <h1 className="text-2xl leading-tight font-semibold text-gray-900 dark:text-gray-100">
          Commission Index Admin
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Create new entries, reprioritize characters, and curate the commission archive.
        </p>
      </header>

      <AdminSectionNav current="admin" />

      {selectedIndex === null ? (
        <div className="mt-2 space-y-6" aria-hidden="true">
          <div className="h-11 w-full animate-pulse rounded-xl border border-gray-200 bg-gray-100/80 dark:border-gray-700 dark:bg-gray-800/60" />
          <div className="h-56 w-full animate-pulse rounded-2xl border border-gray-200 bg-gray-100/70 dark:border-gray-700 dark:bg-gray-800/40" />
        </div>
      ) : (
        <TabGroup selectedIndex={selectedIndex} onChange={setSelectedIndex}>
          <TabList className="flex gap-2 rounded-xl border border-gray-200 bg-white/80 p-1 text-sm font-medium shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/60">
            {tabs.map(tab => (
              <Tab
                key={tab}
                className={({ selected }) =>
                  `flex-1 rounded-lg px-4 py-2.5 text-center transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none dark:focus-visible:ring-offset-gray-900 ${
                    selected
                      ? 'bg-gray-900 text-white shadow-sm dark:bg-gray-100 dark:text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60'
                  }`
                }
              >
                {tab}
              </Tab>
            ))}
          </TabList>

          <TabPanels className="mt-6 space-y-8">
            <TabPanel className="animate-[tabFade_260ms_ease-out] focus:outline-none">
              <div className="space-y-4">
                <AddCharacterForm />
                <AddCommissionForm characters={characterOptions} />
              </div>
            </TabPanel>

            <TabPanel className="animate-[tabFade_260ms_ease-out] focus:outline-none">
              <CommissionManager
                characters={characters}
                commissions={commissions}
                creatorAliases={creatorAliases}
              />
            </TabPanel>
          </TabPanels>
        </TabGroup>
      )}
    </div>
  )
}

export default AdminDashboard
