import Analytics from '#components/layout/Analytics'
import { Outlet } from 'react-router-dom'

const AppShell = () => {
  return (
    <div className="min-h-dvh antialiased selection:bg-gray-400/25 dark:bg-neutral-900">
      <div className="mx-4 min-h-dvh max-w-2xl pt-7 pb-16 text-sm leading-relaxed sm:pt-20 sm:pb-32 sm:text-base md:mx-auto md:min-h-screen">
        <Outlet />
      </div>
      <Analytics />
    </div>
  )
}

export default AppShell
