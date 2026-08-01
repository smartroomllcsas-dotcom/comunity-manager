'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getCurrentUser, logout as doLogout } from '@/lib/auth'
import { createClient as createSupabaseBrowser } from '@/lib/supabase/client'
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
  '/',
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
    let cancelled = false

    async function loadIdentity() {
      if (isPublic) {
        setUser(null)
        setLoading(false)
        return
      }

      const localUser = await getCurrentUser()
      let resolvedUser = localUser

      // SmartTalk routes can have a valid Supabase session while the legacy
      // CM session is still warming up. Use the agent as the display fallback.
      if (!resolvedUser && smarttalk) {
        const { data: { user: authUser } } = await createSupabaseBrowser().auth.getUser()
        if (authUser) {
          const { data: agent } = await createSupabaseBrowser()
            .from('agents')
            .select('id, email, name, role')
            .eq('id', authUser.id)
            .maybeSingle()

          if (agent) {
            resolvedUser = {
              id: agent.id,
              email: agent.email || authUser.email || '',
              name: agent.name || authUser.user_metadata?.name || authUser.email || 'Usuario',
              role: agent.role || 'user',
              plan: 'free',
              avatar_url: null,
              created_at: '',
              updated_at: '',
            }
          }
        }
      }

      if (cancelled) return
      setUser(resolvedUser)
      setLoading(false)
      if (!resolvedUser && !smarttalk) router.push('/login')
    }

    void loadIdentity()

    return () => {
      cancelled = true
    }
  }, [pathname, router, isPublic, smarttalk])

  const logout = async () => {
    doLogout()
    try {
      await createSupabaseBrowser().auth.signOut()
    } catch {
      // ignore if no supabase session
    }
    document.cookie = 'cm_user_id=; Path=/; Max-Age=0'
    setUser(null)
    router.push('/login')
  }

  if (isPublic) {
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

  if (!user && !smarttalk) {
    return null
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
