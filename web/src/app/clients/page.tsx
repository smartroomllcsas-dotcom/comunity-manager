'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { CMClient } from '@/types/database'

interface SocialAccount {
  id: string
  client_id: string
  page_id: string | null
  page_name: string | null
  instagram_id: string | null
  instagram_username: string | null
  connected_at: string
}

const platformColors: Record<string, string> = {
  Instagram: 'bg-pink-500/20 text-pink-400',
  Twitter: 'bg-sky-500/20 text-sky-400',
  LinkedIn: 'bg-blue-800/30 text-blue-400',
  TikTok: 'bg-slate-600/30 text-slate-300',
  Facebook: 'bg-indigo-500/20 text-indigo-400',
  YouTube: 'bg-red-500/20 text-red-400',
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  onboarding: 'bg-amber-500/20 text-amber-400',
  paused: 'bg-slate-500/20 text-slate-400',
}

const allPlatforms = ['Instagram', 'Twitter', 'LinkedIn', 'TikTok', 'Facebook', 'YouTube']

export default function ClientsPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<CMClient[]>([])
  const [socials, setSocials] = useState<Record<string, SocialAccount>>({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', industry: '', platforms: [] as string[], language: 'es' })
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Check URL params for Meta OAuth results
  useEffect(() => {
    const success = searchParams.get('meta_success')
    const error = searchParams.get('meta_error')
    if (success) {
      setNotification({ type: 'success', message: decodeURIComponent(success) })
      window.history.replaceState({}, '', '/clients')
    }
    if (error) {
      setNotification({ type: 'error', message: decodeURIComponent(error) })
      window.history.replaceState({}, '', '/clients')
    }
  }, [searchParams])

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  async function loadData() {
    const [clientsRes, socialsRes] = await Promise.all([
      supabase.from('cm_clients').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('cm_social_accounts').select('*'),
    ])
    setClients(clientsRes.data ?? [])
    const socialMap: Record<string, SocialAccount> = {}
    for (const s of (socialsRes.data ?? [])) {
      socialMap[s.client_id] = s
    }
    setSocials(socialMap)
    setLoading(false)
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.name.trim()) return
    setSaving(true)

    const { error } = await supabase.from('cm_clients').insert({
      user_id: user.id,
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      platforms: form.platforms,
      language: form.language,
      status: 'onboarding',
    })

    if (!error) {
      await supabase.from('cm_activity_log').insert({
        user_id: user.id,
        action: `Nuevo cliente agregado: ${form.name.trim()}`,
        status: 'success',
      })
      setForm({ name: '', industry: '', platforms: [], language: 'es' })
      setShowAddModal(false)
      await loadData()
    }
    setSaving(false)
  }

  function togglePlatform(p: string) {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p) ? prev.platforms.filter(x => x !== p) : [...prev.platforms, p],
    }))
  }

  function connectMeta(clientId: string) {
    window.location.href = `/api/auth/meta?clientId=${clientId}`
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
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
      {/* Notification */}
      {notification && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
          notification.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Clientes</h1>
          <p className="text-slate-400 mt-1">{clients.length} cuentas gestionadas</p>
        </div>
        <button
          onClick={() => setShowAddModal(!showAddModal)}
          className="bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Agregar Cliente
        </button>
      </div>

      {showAddModal && (
        <form onSubmit={handleAddClient} className="mb-6 bg-slate-900 border border-violet-500/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Nuevo Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Nombre del Cliente *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="Nombre de la marca"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Industria</label>
              <input
                type="text"
                value={form.industry}
                onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="e.g. SaaS / Tecnología"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs text-slate-400 block mb-2">Plataformas</label>
            <div className="flex flex-wrap gap-2">
              {allPlatforms.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    form.platforms.includes(p)
                      ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {saving ? 'Guardando...' : 'Agregar Cliente'}
            </button>
            <button type="button" onClick={() => setShowAddModal(false)} className="text-xs text-slate-500 hover:text-slate-300">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {clients.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-slate-400 mb-2">Sin clientes aún</p>
          <p className="text-sm text-slate-500">Haz clic en "Agregar Cliente" para vincular tu primera marca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => {
            const social = socials[client.id]
            return (
              <div
                key={client.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{client.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{client.industry || 'Sin industria'}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusStyles[client.status]}`}>
                    {client.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(client.platforms || []).map((p) => (
                    <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${platformColors[p] || 'bg-slate-700 text-slate-300'}`}>
                      {p}
                    </span>
                  ))}
                </div>

                {/* Social Connection Status */}
                {social ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium text-emerald-400">Redes Conectadas</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {social.page_name && <span className="text-blue-400">FB: {social.page_name}</span>}
                      {social.instagram_username && (
                        <span className="text-pink-400 ml-2">IG: @{social.instagram_username}</span>
                      )}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => connectMeta(client.id)}
                    className="w-full bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg px-3 py-2.5 text-xs font-medium hover:bg-blue-600/30 transition-colors mb-3 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                    </svg>
                    Conectar Instagram + Facebook
                  </button>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <span className="text-xs text-slate-500">
                    Agregado hace {timeAgo(client.created_at)}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {client.posts_this_month} posts/mes
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
