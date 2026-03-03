import NotFoundPage from '#components/shared/NotFoundPage'
import type { CreatorAliasRow } from '#lib/admin/db'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'
import { useEffect, useState } from 'react'
import AliasesDashboard from './AliasesDashboard'

type BootstrapPayload = {
  creatorAliases: CreatorAliasRow[]
}

const AdminAliasesPage = () => {
  useDocumentTitle('Admin Aliases')

  const [payload, setPayload] = useState<BootstrapPayload | null>(null)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!import.meta.env?.DEV) return

    let active = true
    const loadData = async () => {
      try {
        const response = await fetch('/api/admin/bootstrap')
        if (!response.ok) throw new Error(`Failed to load aliases data: ${response.status}`)
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
    return () => {
      active = false
    }
  }, [])

  if (!import.meta.env?.DEV) {
    return <NotFoundPage />
  }

  if (isError) {
    return <NotFoundPage />
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-10 lg:px-0">
        <p>Loading aliases data...</p>
      </div>
    )
  }

  return <AliasesDashboard creators={payload.creatorAliases} />
}

export default AdminAliasesPage
