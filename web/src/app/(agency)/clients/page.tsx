'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import WhatsAppConnectButton from '@/components/WhatsAppConnectButton'
import WhatsAppSetupPanel from '@/components/WhatsAppSetupPanel'
import { supabase } from '@/lib/supabase'
import type { CMClient } from '@/types/database'

interface SocialAccount {
  id: string
  client_id: string
  meta_user_id: string
  access_token: string
  page_id: string | null
  page_name: string | null
  instagram_id: string | null
  instagram_username: string | null
  ad_account_id: string | null
  ad_account_name: string | null
  business_id: string | null
  token_expires_at: string | null
  connected_at: string
}

interface WhatsAppAccount {
  id: string
  client_id: string | null
  waba_id: string
  phone_number_id: string
  display_phone_number: string | null
  verified_name: string | null
  connected_at: string
}

const platformColors: Record<string, string> = {
  Instagram: 'bg-pink-500/20 text-pink-400',
  WhatsApp: 'bg-emerald-500/20 text-emerald-400',
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

const allPlatforms = ['Instagram', 'WhatsApp', 'Twitter', 'LinkedIn', 'TikTok', 'Facebook', 'YouTube']

export default function ClientsPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<CMClient[]>([])
  const [socials, setSocials] = useState<Record<string, SocialAccount>>({})
  const [whatsapps, setWhatsapps] = useState<Record<string, WhatsAppAccount>>({})
  const [campaignsByClient, setCampaignsByClient] = useState<
    Record<string, Array<{ id: string; name: string; status: string; objective?: string; spend?: number; impressions?: number; clicks?: number }>>
  >({})
  const [insightsByClient, setInsightsByClient] = useState<
    Record<string, { source?: string; error?: string; insights?: Array<{ name: string; value: string | number }>; ads?: unknown[]; page?: unknown[] }>
  >({})
  const [metaLoadingClientId, setMetaLoadingClientId] = useState<string | null>(null)
  const [whatsappLoadingClientId, setWhatsappLoadingClientId] = useState<string | null>(null)
  const [whatsappFeedback, setWhatsappFeedback] = useState<Record<string, string>>({})
  const [whatsappPinByClient, setWhatsappPinByClient] = useState<Record<string, string>>({})
  const [whatsappTestToByClient, setWhatsappTestToByClient] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', industry: '', platforms: [] as string[], language: 'es' })
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [metaTrace, setMetaTrace] = useState<{
    clientId?: string
    flow?: string
    page?: string
    pageId?: string
    instagram?: string
    adAccount?: string
    updatedAt?: string
  } | null>(null)

  // Check URL params for Meta OAuth results
  useEffect(() => {
    const success = searchParams.get('meta_success')
    const error = searchParams.get('meta_error')
    if (success) {
      setNotification({ type: 'success', message: decodeURIComponent(success) })
      setMetaTrace({
        clientId: searchParams.get('meta_client_id') || undefined,
        flow: searchParams.get('meta_flow') || undefined,
        page: searchParams.get('meta_page') || undefined,
        pageId: searchParams.get('meta_page_id') || undefined,
        instagram: searchParams.get('meta_instagram') || undefined,
        adAccount: searchParams.get('meta_ad_account') || undefined,
        updatedAt: new Date().toISOString(),
      })
      window.history.replaceState({}, '', '/clients')
      if (user) {
        loadData()
        void syncAfterMetaReturn()
      }
    }
    if (error) {
      setNotification({ type: 'error', message: decodeURIComponent(error) })
      setMetaTrace({
        flow: searchParams.get('meta_flow') || undefined,
        updatedAt: new Date().toISOString(),
      })
      window.history.replaceState({}, '', '/clients')
      if (user) {
        loadData()
      }
    }
  }, [searchParams, user])

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

  useEffect(() => {
    if (!user || loading) return
    for (const client of clients) {
      const social = socials[client.id]
      if (social?.ad_account_id && campaignsByClient[client.id] === undefined) {
        void loadCampaigns(client.id)
      }
      if (social && insightsByClient[client.id] === undefined) {
        void loadInsights(client.id)
      }
    }
  }, [user, loading, clients, socials, campaignsByClient, insightsByClient])

  async function loadData() {
    const [clientsRes, socialsRes, whatsappsResponse] = await Promise.all([
      supabase.from('cm_clients').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('cm_social_accounts').select('*'),
      fetch('/api/whatsapp/accounts'),
    ])
    const whatsappsPayload = whatsappsResponse.ok
      ? await whatsappsResponse.json()
      : { accounts: [] }
    setClients(clientsRes.data ?? [])
    const socialMap: Record<string, SocialAccount> = {}
    for (const s of (socialsRes.data ?? [])) {
      socialMap[s.client_id] = s
    }
    setSocials(socialMap)
    const whatsappMap: Record<string, WhatsAppAccount> = {}
    for (const account of (whatsappsPayload.accounts ?? [])) {
      if (account.client_id) whatsappMap[account.client_id] = account
    }
    setWhatsapps(whatsappMap)
    setLoading(false)
  }

  async function syncAfterMetaReturn() {
    for (const waitMs of [0, 700, 1500]) {
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs))
      }
      await loadData()
    }
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

  async function loadCampaigns(clientId: string) {
    setMetaLoadingClientId(clientId)
    try {
      const res = await fetch(`/api/meta/campaigns?clientId=${clientId}`)
      const data = await res.json()
      setCampaignsByClient(prev => ({
        ...prev,
        [clientId]: Array.isArray(data.campaigns) ? data.campaigns : [],
      }))
    } finally {
      setMetaLoadingClientId(null)
    }
  }

  async function loadInsights(clientId: string) {
    setMetaLoadingClientId(clientId)
    try {
      const res = await fetch(`/api/meta/insights?clientId=${clientId}`)
      const data = await res.json()
      setInsightsByClient(prev => ({
        ...prev,
        [clientId]: data && typeof data === 'object' ? data : {},
      }))
    } finally {
      setMetaLoadingClientId(null)
    }
  }

  async function runWhatsAppAction(clientId: string, endpoint: string, body: Record<string, unknown>) {
    setWhatsappLoadingClientId(clientId)
    setWhatsappFeedback(prev => ({ ...prev, [clientId]: '' }))
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...body }),
      })
      const data = await res.json()
      setWhatsappFeedback(prev => ({
        ...prev,
        [clientId]: data.error || (data.success ? 'Operacion completada' : 'Respuesta recibida'),
      }))
    } finally {
      setWhatsappLoadingClientId(null)
    }
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

      {metaTrace && (
        <div className="mb-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs text-cyan-100">
          <div className="font-semibold text-cyan-300 mb-2">Meta trace</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>Flow: {metaTrace.flow || 'n/a'}</div>
            <div>Client: {metaTrace.clientId || 'n/a'}</div>
            <div>Page: {metaTrace.page || 'n/a'}</div>
            <div>Instagram: {metaTrace.instagram || 'n/a'}</div>
            <div>Ads: {metaTrace.adAccount || 'n/a'}</div>
            <div>Updated: {metaTrace.updatedAt || 'n/a'}</div>
          </div>
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
            const whatsapp = whatsapps[client.id]
            const traceMatchesClient = metaTrace?.clientId === client.id && metaTrace.flow === 'facebook_instagram_ads'
            const metaConnected = Boolean(social || traceMatchesClient)
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
                {(((client.platforms || []).includes('Instagram') || (client.platforms || []).includes('Facebook')) || metaConnected) ? (
                  metaConnected ? (
                    <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[11px] font-medium text-emerald-400">
                          {social ? 'Redes Conectadas' : 'Conexión Meta en proceso'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {social ? (
                          <>
                            {social.page_name && <span className="text-blue-400">FB: {social.page_name}</span>}
                            {social.instagram_username && (
                              <span className="text-pink-400 ml-2">IG: @{social.instagram_username}</span>
                            )}
                            {social.ad_account_name && (
                              <span className="text-amber-400 ml-2">Ads: {social.ad_account_name}</span>
                            )}
                          </>
                        ) : (
                          <>
                            {metaTrace?.page && <span className="text-blue-400">FB: {metaTrace.page}</span>}
                            {metaTrace?.instagram && (
                              <span className="text-pink-400 ml-2">IG: @{metaTrace.instagram}</span>
                            )}
                            {metaTrace?.adAccount && (
                              <span className="text-amber-400 ml-2">Ads: {metaTrace.adAccount}</span>
                            )}
                          </>
                        )}
                      </p>
                      <a
                        href={`/clients/${client.id}/meta`}
                        className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-[11px] text-slate-100 transition hover:bg-slate-700"
                      >
                        Ver Meta
                      </a>
                    </div>
                  ) : (
                    <button
                      onClick={() => connectMeta(client.id)}
                      className="w-full bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg px-3 py-2.5 text-xs font-medium hover:bg-blue-600/30 transition-colors mb-3 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                      </svg>
                      Conectar Facebook + Instagram + Ads
                    </button>
                  )
                ) : null}

                {whatsapp ? (
                  <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium text-emerald-400">WhatsApp Conectado</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {whatsapp.verified_name || whatsapp.display_phone_number || whatsapp.phone_number_id}
                    </p>
                    <a
                      href={`/clients/${client.id}/whatsapp`}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-[11px] text-slate-100 transition hover:bg-slate-700"
                    >
                      Ver WhatsApp
                    </a>
                  </div>
                ) : (
                  <div className="mb-3">
                    <WhatsAppConnectButton
                      clientId={client.id}
                      userId={user?.id}
                      onConnected={loadData}
                      compact
                    />
                  </div>
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
