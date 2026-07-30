'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { CMClient, CMAgent, CMActivityLog } from '@/types/database'

export default function Dashboard() {
  const { user } = useAuth()
  const [clients, setClients] = useState<CMClient[]>([])
  const [agents, setAgents] = useState<CMAgent[]>([])
  const [activity, setActivity] = useState<CMActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('cm_clients').select('*').eq('user_id', user.id),
      supabase.from('cm_agents').select('*'),
      supabase.from('cm_activity_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    ]).then(([clientsRes, agentsRes, activityRes]) => {
      setClients(clientsRes.data ?? [])
      setAgents(agentsRes.data ?? [])
      setActivity(activityRes.data ?? [])
      setLoading(false)
    })
  }, [user])

  const activeAgents = agents.filter(a => a.status === 'active').length
  const totalSkills = agents.reduce((sum, a) => sum + a.skills, 0)

  const stats = [
    { label: 'Clientes Activos', value: String(clients.filter(c => c.status === 'active').length), change: `${clients.length} total`, color: 'text-violet-400' },
    { label: 'Skills Cargados', value: String(totalSkills), change: `${agents.length} agentes`, color: 'text-emerald-400' },
    { label: 'Agentes Online', value: `${activeAgents}/${agents.length}`, change: 'Fase 1 activa', color: 'text-amber-400' },
    { label: 'Posts del Mes', value: String(clients.reduce((s, c) => s + c.posts_this_month, 0)), change: 'En todos los clientes', color: 'text-sky-400' },
  ]

  const quickActions = [
    { label: 'Agregar Cliente', description: 'Configurar nuevo perfil', href: '/clients', icon: UserPlusIcon },
    { label: 'Crear Contenido', description: 'Generar posts con IA', href: '/chat', icon: PenIcon },
    { label: 'Ver Calendario', description: 'Revisar programación', href: '/calendar', icon: CalIcon },
    { label: 'Generar Reporte', description: 'Analíticas y rendimiento', href: '#', icon: ChartIcon },
  ]

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Bienvenido{user?.name ? `, ${user.name}` : ''}</h1>
        <p className="text-slate-400 mt-1">Esto es lo que está pasando en tus comunidades gestionadas.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 mt-2">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <a
                key={action.label}
                href={action.href}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-violet-500/40 hover:bg-slate-800/50 transition-colors group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center mb-3 group-hover:bg-violet-600/30 transition-colors">
                  <Icon className="w-5 h-5 text-violet-400" />
                </div>
                <p className="text-sm font-medium text-slate-200">{action.label}</p>
                <p className="text-xs text-slate-500 mt-1">{action.description}</p>
              </a>
            )
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Actividad Reciente</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {activity.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              Sin actividad aún. ¡Empieza agregando tu primer cliente!
            </div>
          ) : (
            activity.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-5 py-3.5 ${
                  i < activity.length - 1 ? 'border-b border-slate-800' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      item.status === 'success' ? 'bg-emerald-500' : item.status === 'error' ? 'bg-red-500' : 'bg-sky-500'
                    }`}
                  />
                  <span className="text-sm text-slate-300">{item.action}</span>
                </div>
                <span className="text-xs text-slate-500">{timeAgo(item.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function CalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
