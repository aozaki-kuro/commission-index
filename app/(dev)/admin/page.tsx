import { notFound } from 'next/navigation'

const AdminPage = async () => {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const [{ default: AdminDashboard }, { getAdminData, getCreatorAliasesAdminData }] =
    await Promise.all([import('./AdminDashboard'), import('#lib/admin/db')])

  const { characters, commissions } = getAdminData()
  const creatorAliases = getCreatorAliasesAdminData()

  return (
    <AdminDashboard
      characters={characters}
      commissions={commissions}
      creatorAliases={creatorAliases}
    />
  )
}

export default AdminPage
