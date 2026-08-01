'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import LegalLinks from './LegalLinks'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/app', label: 'Panel', icon: LayoutIcon },
  { href: '/chat', label: 'Chat', icon: ChatIcon },
  { href: '/clients', label: 'Marcas', icon: UsersIcon },
  { href: '/contacts', label: 'Leads', icon: UsersIcon },
  { href: '/settings/channels', label: 'Canales', icon: ChannelIcon },
  { href: '/calendar', label: 'Calendario', icon: CalendarIcon },
  { href: '/settings/agents', label: 'Equipo', icon: CpuIcon },
  { href: '/inbox', label: 'Inbox', icon: InboxIcon },
  { href: '/settings/billing', label: 'Mi plan', icon: CreditCardIcon },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseClient()
    void (async () => {
      const { data } = await supabase.auth.getUser()
      const authUser = data.user
      if (!authUser) return
      const { data: agent } = await supabase
        .from('agents')
        .select('is_super_admin')
        .eq('id', authUser.id)
        .maybeSingle()
      setIsSuperAdmin(agent?.is_super_admin === true)
    })()
  }, [])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-slate-950 border-r border-slate-800 flex flex-col z-50">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <img
            src="/community-manager-logo.png"
            alt="Community Manager"
            className="h-11 w-11 rounded-2xl border border-white/10 object-cover shadow-lg shadow-cyan-500/10"
          />
          <div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              <span className="text-violet-500">Comunity</span>Agent
            </h1>
            <p className="text-xs text-slate-500 mt-1">Plataforma de Gestión</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {[...navItems, ...(isSuperAdmin ? [{ href: '/admin', label: 'Administración', icon: ShieldIcon }] : [])].map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-800/80 bg-slate-950/70 p-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 shadow-inner shadow-black/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 shadow-lg shadow-violet-950/40">
              <span className="text-sm font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{user?.name || 'Usuario'}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                {user?.role === 'admin' ? 'Administrador' : 'Cuenta activa'}
              </p>
            </div>
          </div>
          <Link
            href="/settings/billing"
            className="mt-3 flex items-center justify-between rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-200"
          >
            <span>Plan y uso</span>
            <span aria-hidden="true">&gt;</span>
          </Link>
        </div>
        <button
          onClick={logout}
          className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-red-400/10 hover:text-red-300"
        >
          <span>Cerrar sesión</span>
          <span aria-hidden="true">&gt;</span>
        </button>
        <LegalLinks
          className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-3 text-[10px] text-slate-600"
          linkClassName="transition-colors hover:text-slate-300"
        />
      </div>
    </aside>
  )
}

function LayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ChannelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="8" cy="7" r="1" fill="currentColor" />
      <circle cx="16" cy="12" r="1" fill="currentColor" />
      <circle cx="10" cy="17" r="1" fill="currentColor" />
    </svg>
  )
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  )
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  )
}
