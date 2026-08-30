'use client'

import AppShell from '@/components/AppShell'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { ActiveBrandProvider } from '@/components/providers/ActiveBrandProvider'

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ActiveBrandProvider>
        <AppShell>{children}</AppShell>
      </ActiveBrandProvider>
    </QueryProvider>
  )
}
