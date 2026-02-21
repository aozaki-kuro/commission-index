'use client'

import Link from 'next/link'

const DevAdminLink = () => {
  return (
    <Link href="/admin">
      <span className="font-bold">Admin</span>
    </Link>
  )
}

export default DevAdminLink
