'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { CMClient, CMScheduledPost } from '@/types/database'

const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const timeSlots = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']

const platformStyle: Record<string, { bg: string; text: string; border: string }> = {
  Instagram: { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  Twitter: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  LinkedIn: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-500/30' },
  TikTok: { bg: 'bg-slate-700/40', text: 'text-slate-300', border: 'border-slate-500/30' },
  Facebook: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  YouTube: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
}

const pillars = [
  { name: 'Educativo', color: 'bg-emerald-500' },
  { name: 'Promocional', color: 'bg-violet-500' },
  { name: 'Engagement', color: 'bg-amber-500' },
  { name: 'Detrás de cámaras', color: 'bg-sky-500' },
  { name: 'Contenido UGC', color: 'bg-pink-500' },
]

export default function CalendarPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<CMClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [posts, setPosts] = useState<CMScheduledPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('cm_clients')
      .select('*')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setClients(data ?? [])
        if (data && data.length > 0) setSelectedClientId(data[0].id)
        setLoading(false)
      })
  }, [user])

  useEffect(() => {
    if (!selectedClientId) return
    supabase
      .from('cm_scheduled_posts')
      .select('*')
      .eq('client_id', selectedClientId)
      .then(({ data }) => setPosts(data ?? []))
  }, [selectedClientId])

  const selectedClient = clients.find(c => c.id === selectedClientId)

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Calendario de Contenido</h1>
          <p className="text-slate-400 mt-1">
            Semana actual | {selectedClient?.name || 'Sin cliente seleccionado'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
          >
            {clients.length === 0 && <option value="">Sin clientes</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Pillar Legend */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-300">Pilares de Contenido</p>
          <p className="text-xs text-slate-500">{posts.length} posts programados</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {pillars.map((pillar) => (
            <div key={pillar.name} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-sm ${pillar.color}`} />
              <span className="text-xs text-slate-400">{pillar.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Header Row */}
        <div className="grid grid-cols-8 border-b border-slate-800">
          <div className="p-3 text-xs font-medium text-slate-500 border-r border-slate-800">Hora</div>
          {days.map((day) => (
            <div key={day} className="p-3 text-xs font-medium text-slate-400 text-center border-r border-slate-800 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Time Rows */}
        {timeSlots.map((time, timeIdx) => (
          <div key={time} className="grid grid-cols-8 border-b border-slate-800/50 last:border-b-0">
            <div className="p-2 text-[11px] text-slate-600 border-r border-slate-800/50 flex items-start pt-3">
              {time}
            </div>
            {days.map((_, dayIdx) => {
              const post = posts.find((p) => p.day_of_week === dayIdx && p.time_slot === timeIdx)
              const style = post ? platformStyle[post.platform] : null
              return (
                <div
                  key={dayIdx}
                  className="p-1 min-h-[52px] border-r border-slate-800/50 last:border-r-0"
                >
                  {post && style && (
                    <div
                      className={`${style.bg} border ${style.border} rounded-md p-1.5 cursor-pointer hover:opacity-80 transition-opacity`}
                    >
                      <p className={`text-[10px] font-medium ${style.text} truncate`}>
                        {post.platform}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{post.title}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {posts.length === 0 && (
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400 mb-1">No hay posts programados</p>
          <p className="text-sm text-slate-500">Usa el Chat para generar y programar contenido con IA.</p>
        </div>
      )}

      {/* Platform Legend */}
      <div className="flex flex-wrap gap-4 mt-4">
        {Object.entries(platformStyle).map(([name, style]) => (
          <div key={name} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${style.bg} border ${style.border}`} />
            <span className="text-xs text-slate-500">{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
