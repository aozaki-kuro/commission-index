'use client'

import AdminDashboard from './AdminDashboard'
import NotFoundPage from '#components/shared/NotFoundPage'
import type { CharacterRow, CommissionRow, CreatorAliasRow } from '#lib/admin/db'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'
import { useEffect, useState } from 'react'
import { subscribeToDataUpdates } from './dataUpdateSignal'

type BootstrapPayload = {
  characters: CharacterRow[]
  commissions: CommissionRow[]
  creatorAliases: CreatorAliasRow[]
}

const AdminPage = () => {
  useDocumentTitle('Admin')

  const [payload, setPayload] = useState<BootstrapPayload | null>(null)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return

    let active = true
    const loadData = async () => {
      try {
        const response = await fetch('/api/admin/bootstrap')
        if (!response.ok) throw new Error(`Failed to load admin data: ${response.status}`)
        const data = (await response.json()) as BootstrapPayload
        if (active) {
          setPayload(data)
          setIsError(false)
        }
      } catch {
        if (active) setIsError(true)
      }
    }

    void loadData()

    const unsubscribe = subscribeToDataUpdates(() => {
      void loadData()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!import.meta.env.DEV) {
    return <NotFoundPage />
  }

  if (isError) {
    return <NotFoundPage />
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-10 lg:px-0">
        <p>Loading admin data...</p>
      </div>
    )
  }

  return (
    <AdminDashboard
      characters={payload.characters}
      commissions={payload.commissions}
      creatorAliases={payload.creatorAliases}
    />
  )
}

export default AdminPage
