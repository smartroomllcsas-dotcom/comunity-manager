'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'

type ClientRecord = {
  id: string
  name: string
  industry: string | null
}

type SocialAccount = {
  page_name: string | null
  instagram_username: string | null
  ad_account_name: string | null
  page_id: string | null
  ad_account_id: string | null
}

type Campaign = {
  id: string
  name: string
  status: string
  objective?: string
  spend?: number
  impressions?: number
  clicks?: number
}

type InsightItem = { name: string; value: string | number }

export default function MetaDetailPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [social, setSocial] = useState<SocialAccount | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [insights, setInsights] = useState<InsightItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !clientId) return
    let mounted = true

    async function load() {
      setLoading(true)
      setError(null)

      const [clientRes, socialRes] = await Promise.all([
        supabase.from('cm_clients').select('id,name,industry,user_id').eq('id', clientId).maybeSingle(),
        supabase.from('cm_social_accounts').select('page_name,instagram_username,ad_account_name,page_id,ad_account_id').eq('client_id', clientId).maybeSingle(),
      ])

      if (!mounted) return

      if (!clientRes.data || !user || clientRes.data.user_id !== user.id) {
        router.replace('/clients')
        return
      }

      setClient({
        id: clientRes.data.id,
        name: clientRes.data.name,
        industry: clientRes.data.industry,
      })

      const socialData = socialRes.data ?? null
      setSocial(socialData)

      if (!socialData?.ad_account_id) {
        try {
          const insightRes = await fetch(`/api/meta/insights?clientId=${clientId}`)
          const insightData = await insightRes.json().catch(() => null)
          if (!mounted) return
          setCampaigns([])
          setInsights(Array.isArray(insightData?.insights) ? insightData.insights : [])
        } catch (fetchError) {
          setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar los datos de Meta')
        } finally {
          if (mounted) setLoading(false)
        }
        return
      }

      try {
        const [campaignRes, insightRes] = await Promise.all([
          fetch(`/api/meta/campaigns?clientId=${clientId}`),
          fetch(`/api/meta/insights?clientId=${clientId}`),
        ])
        const campaignData = await campaignRes.json().catch(() => null)
        const insightData = await insightRes.json().catch(() => null)
        if (!mounted) return
        setCampaigns(Array.isArray(campaignData?.campaigns) ? campaignData.campaigns : [])
        setInsights(Array.isArray(insightData?.insights) ? insightData.insights : [])
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar los datos de Meta')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()
    return () => {
      mounted = false
    }
  }, [user, clientId, router])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={() => router.push('/clients')}
        className="mb-5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
      >
        Volver a clientes
      </button>
      <button
        type="button"
        onClick={() => router.push('/inbox')}
        className="mb-5 ml-3 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20"
      >
        Ir a bandeja de entrada
      </button>

      <div className="mb-6 rounded-3xl border border-white/10 bg-slate-950/55 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">Facebook ready</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{client.name}</h1>
        <p className="mt-2 text-sm text-slate-400">{client.industry || 'Sin industria'}</p>
        <p className="mt-4 text-sm text-slate-300">
          {social?.page_name && <span className="text-blue-400">FB: {social.page_name}</span>}
          {social?.instagram_username && <span className="ml-2 text-pink-400">IG: @{social.instagram_username}</span>}
          {social?.ad_account_name && <span className="ml-2 text-amber-400">Ads: {social.ad_account_name}</span>}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Campañas</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Rendimiento de Facebook</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {campaigns.length} campañas
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {campaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                Sin campañas disponibles.
              </div>
            ) : (
              campaigns.map(campaign => (
                <article key={campaign.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">{campaign.name}</h3>
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">
                        {campaign.status}{campaign.objective ? ` · ${campaign.objective}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300">
                      Meta
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm text-slate-300">
                    <Stat label="Spend" value={`$${Number(campaign.spend ?? 0).toFixed(2)}`} />
                    <Stat label="Impr." value={Number(campaign.impressions ?? 0).toLocaleString()} />
                    <Stat label="Clicks" value={Number(campaign.clicks ?? 0).toLocaleString()} />
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Insights</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Métricas de la página</h2>
          </div>

          <div className="mt-5 space-y-3">
            {insights.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                Sin insights disponibles.
              </div>
            ) : (
              insights.map(item => (
                <div key={item.name} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{item.name}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{String(item.value)}</div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-4 text-sm text-slate-200">
            Esta vista muestra la conexión de Facebook del cliente. Las campañas e insights aparecerán cuando se vincule Ads.
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-100">{value}</div>
    </div>
  )
}
