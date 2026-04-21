'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const publicRoutes = ['/login', '/privacy-policy', '/data-deletion', '/terms']
  if (publicRoutes.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60">
        {children}
      </main>
    </div>
  )
}
