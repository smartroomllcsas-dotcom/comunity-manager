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

const PUBLIC_ROUTES = ['/login', '/privacy-policy', '/data-deletion', '/terms', '/test-fb-login']

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CMUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const isPublic = PUBLIC_ROUTES.includes(pathname)

  useEffect(() => {
    if (isPublic) {
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
  }, [pathname, router, isPublic])

  const logout = () => {
    doLogout()
    setUser(null)
    router.push('/login')
  }

  if (isPublic) {
    return (
      <AuthContext.Provider value={{ user, loading: false, logout }}>
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
