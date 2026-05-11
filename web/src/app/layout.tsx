import type { Metadata } from 'next'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
import AppShell from '@/components/AppShell'
import FacebookSDK from '@/components/FacebookSDK'

export const metadata: Metadata = {
  title: 'ComunityAgent - Community Manager Platform',
  description: 'AI-powered community management platform',
  icons: {
    icon: '/community-manager-logo.png',
    shortcut: '/community-manager-logo.png',
    apple: '/community-manager-logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">
        <FacebookSDK />
        <AuthProvider>
          <AppShell>
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}
