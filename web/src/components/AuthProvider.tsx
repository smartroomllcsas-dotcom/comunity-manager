'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getCurrentUser, logout as doLogout } from '@/lib/auth'
import type { CMUser } from '@/types/database'

interface AuthContextType {
  user: CMUser | null
  loading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, logout: () => {} })

export function useAuth() {
  return useContext(AuthContext)
}

const PUBLIC_ROUTES = new Set([
  '/login',
  '/st/login',
  '/privacy-policy',
  '/data-deletion',
  '/terms',
  '/test-fb-login',
])

const SMARTTALK_PREFIXES = [
  '/inbox',
  '/contacts',
  '/broadcasts',
  '/chatbot',
  '/settings',
  '/dashboard',
  '/reports',
  '/admin',
]

function isSmarttalkArea(pathname: string) {
  if (pathname.startsWith('/register') || pathname.startsWith('/invite')) return true
  return SMARTTALK_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.has(pathname)) return true
  return false
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CMUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const isPublic = isPublicRoute(pathname)
  const smarttalk = isSmarttalkArea(pathname)

  useEffect(() => {
    if (isPublic || smarttalk) {
      setLoading(false)
      return
    }
    getCurrentUser().then((u) => {
      setUser(u)
      setLoading(false)
      if (!u) {
        router.push('/login')
      }
    })
  }, [pathname, router, isPublic, smarttalk])

  const logout = () => {
    doLogout()
    setUser(null)
    router.push('/login')
  }

  if (isPublic || smarttalk) {
    return (
      <AuthContext.Provider value={{ user: null, loading: false, logout }}>
        {children}
      </AuthContext.Provider>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
