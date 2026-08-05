'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { SubscriptionStatusBanner } from '@/components/billing/SubscriptionStatusBanner'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const publicRoutes = ['/login', '/st/login', '/privacy-policy', '/data-deletion', '/terms', '/test-fb-login', '/register']
  if (publicRoutes.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <SubscriptionStatusBanner />
        {children}
      </main>
    </div>
  )
}
