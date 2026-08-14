'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import WhatsAppConnectButton from '@/components/WhatsAppConnectButton'
import WhatsAppSetupPanel from '@/components/WhatsAppSetupPanel'

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
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!user || !clientId) return
    let mounted = true
    let refreshTimer: ReturnType<typeof setInterval> | null = null

    async function load(silent = false) {
      if (!silent) setLoading(true)

      // La marca se resuelve contra /api/cm/clients, que ya aplica
      // organización, rol y asignaciones de asesor en el servidor.
      //
      // Antes se consultaba `cm_clients` desde el navegador y se comparaba su
      // propietario histórico con el usuario de la sesión: eso expulsaba a
      // /clients a cualquiera que no fuera ese propietario —administradores de
      // la agencia y asesores asignados incluidos—, aunque el resto del módulo
      // sí los autorizara.
      const [clientsResponse, waResponse, historyResponse] = await Promise.all([
        fetch('/api/cm/clients', { cache: 'no-store' }),
        fetch(`/api/whatsapp/accounts?clientId=${encodeURIComponent(clientId)}`, {
          cache: 'no-store',
        }),
        fetch(`/api/whatsapp/history?clientId=${encodeURIComponent(clientId)}`, {
          cache: 'no-store',
        }),
      ])

      if (!mounted) return

      // 403 explícito del servidor: no es «no existe», es «no es tuya».
      if (waResponse.status === 403 || historyResponse.status === 403) {
        setForbidden(true)
        setLoading(false)
        return
      }

      const clientsPayload = clientsResponse.ok
        ? await clientsResponse.json()
        : { clients: [] }
      const brand = (clientsPayload.clients ?? []).find(
        (row: { id: string }) => row.id === clientId,
      )

      // Fuera del alcance del usuario: se vuelve al listado, que es donde sí
      // puede elegir algo.
      if (!brand) {
        router.replace('/clients')
        return
      }

      const waPayload = waResponse.ok ? await waResponse.json() : { accounts: [] }
      const historyPayload = historyResponse.ok
        ? await historyResponse.json()
        : { entries: [] }

      setClient({
        id: brand.id,
        name: brand.name,
        industry: brand.industry ?? null,
      })
      setWhatsApp(waPayload.accounts?.[0] ?? null)
      const chatRows = (historyPayload.entries ?? []) as ChatHistoryRow[]
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

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div
          data-testid="whatsapp-forbidden"
          className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6"
        >
          <h1 className="text-sm font-semibold text-red-300">No autorizado</h1>
          <p className="mt-2 text-xs text-slate-400">
            Esta marca no está en tu alcance. Si crees que debería estarlo, pide que te la
            asignen.
          </p>
          <button
            type="button"
            onClick={() => router.push('/clients')}
            className="mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            Volver a clientes
          </button>
        </div>
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
