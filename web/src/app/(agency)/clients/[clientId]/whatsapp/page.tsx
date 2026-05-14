'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import WhatsAppConnectButton from '@/components/WhatsAppConnectButton'
import WhatsAppSetupPanel from '@/components/WhatsAppSetupPanel'
import { supabase } from '@/lib/supabase'

type ClientRecord = {
  id: string
  name: string
  industry: string | null
}

type WhatsAppRecord = {
  client_id: string | null
  waba_id: string
  phone_number_id: string
  display_phone_number: string | null
  verified_name: string | null
}

type ChatHistoryRow = {
  id: string
  role: string
  content: string
  client_context: string | null
  created_at: string
}

export default function WhatsAppDetailPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams<{ clientId: string }>()
  const clientId = params?.clientId
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [whatsapp, setWhatsApp] = useState<WhatsAppRecord | null>(null)
  const [webhookEvents, setWebhookEvents] = useState<Array<{
    id: string
    eventType: string
    content?: string
    messageId: string | null
    status: string | null
    from: string | null
    receivedAt: string
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !clientId) return
    let mounted = true
    let refreshTimer: ReturnType<typeof setInterval> | null = null

    async function load(silent = false) {
      if (!silent) setLoading(true)
      const [clientRes, waRes, chatRes] = await Promise.all([
        supabase.from('cm_clients').select('id,name,industry,user_id').eq('id', clientId).maybeSingle(),
        supabase.from('cm_whatsapp_accounts').select('client_id,waba_id,phone_number_id,display_phone_number,verified_name').eq('client_id', clientId).maybeSingle(),
        supabase
          .from('cm_chat_history')
          .select('id,role,content,client_context,created_at')
          .eq('client_context', `whatsapp:${clientId}`)
          .order('created_at', { ascending: false })
          .limit(12),
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
      setWhatsApp(waRes.data ?? null)
      const chatRows = (chatRes.data ?? []) as ChatHistoryRow[]
      setWebhookEvents(
        chatRows.map(row => ({
          id: row.id,
          eventType: row.role === 'assistant' ? 'mensaje enviado' : 'respuesta recibida',
          content: row.content,
          messageId: null,
          status: row.role === 'assistant' ? 'enviado' : 'recibido',
          from: row.role === 'assistant' ? 'Community ManagerWA' : 'WhatsApp',
          receivedAt: new Date(row.created_at).toLocaleString('es-CO', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }))
      )
      if (!silent) setLoading(false)
    }

    void load()
    refreshTimer = setInterval(() => {
      void load(true)
    }, 8000)
    return () => {
      mounted = false
      if (refreshTimer) clearInterval(refreshTimer)
    }
  }, [user, clientId, router])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!client) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={() => router.push('/clients')}
        className="mb-5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
      >
        Volver a clientes
      </button>

      <div className="mb-6 rounded-3xl border border-white/10 bg-slate-950/55 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">WhatsApp</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{client.name}</h1>
        <p className="mt-2 text-sm text-slate-400">{client.industry || 'Sin industria'}</p>
      </div>

      {whatsapp ? (
        <WhatsAppSetupPanel
          clientId={client.id}
          connection={whatsapp}
          webhookEvents={webhookEvents}
        />
      ) : (
        <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-6">
          <p className="text-sm text-slate-300">WhatsApp no está conectado todavía.</p>
          <div className="mt-4">
            <WhatsAppConnectButton clientId={client.id} userId={user?.id} />
          </div>
        </div>
      )}
    </div>
  )
}
