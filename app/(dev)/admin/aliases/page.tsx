import { notFound } from 'next/navigation'

const AdminAliasesPage = async () => {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const [{ default: AliasesDashboard }, { getCreatorAliasesAdminData }] = await Promise.all([
    import('./AliasesDashboard'),
    import('#lib/admin/db'),
  ])

  const creators = getCreatorAliasesAdminData()

  return <AliasesDashboard creators={creators} />
}

export default AdminAliasesPage
