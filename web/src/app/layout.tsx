import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
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
    <html lang="es" className="dark">
      <body className="bg-background text-foreground antialiased">
        <FacebookSDK />
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
