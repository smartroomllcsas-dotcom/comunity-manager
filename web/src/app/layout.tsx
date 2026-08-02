import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
import FacebookSDK from '@/components/FacebookSDK'

export const metadata: Metadata = {
  title: 'Community Manager - Gestión multicanal para agencias',
  description: 'Centraliza WhatsApp, Facebook Messenger e Instagram para gestionar marcas, asesores y conversaciones.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'Community Manager',
    description: 'Gestión multicanal para agencias: WhatsApp, Messenger e Instagram en un solo lugar.',
    images: ['/og-image.svg'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Community Manager',
    description: 'Gestión multicanal para agencias.',
    images: ['/og-image.svg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-background text-foreground antialiased">
        <FacebookSDK />
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
