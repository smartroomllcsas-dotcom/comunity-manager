'use client'

import { useState } from 'react'

type WhatsAppConnection = {
  waba_id: string
  phone_number_id: string
  display_phone_number: string | null
  verified_name: string | null
}

type Props = {
  clientId: string
  connection: WhatsAppConnection | null
  webhookEvents?: Array<{
    id: string
    eventType: string
    content?: string
    messageId: string | null
    status: string | null
    from: string | null
    receivedAt: string
  }>
}

export default function WhatsAppSetupPanel({ clientId, connection, webhookEvents = [] }: Props) {
  const [recipient, setRecipient] = useState('')
  const [testMessage, setTestMessage] = useState('Mensaje de prueba desde Community ManagerWA')
  const [registrationPin, setRegistrationPin] = useState('123456')
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'subscribe' | 'register' | 'message' | null>(null)

  const isReady = Boolean(connection?.waba_id && connection?.phone_number_id)
  const isConnected = Boolean(connection)

  function reconnect() {
    window.dispatchEvent(new CustomEvent('launch-whatsapp-embedded-signup'))
  }

  async function subscribeWebhook() {
    setBusyAction('subscribe')
    setActionStatus(null)
    try {
      const response = await fetch('/api/whatsapp/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'No se pudo suscribir el webhook')
      setActionStatus(payload?.message || 'Webhook suscrito correctamente')
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'No se pudo suscribir el webhook')
    } finally {
      setBusyAction(null)
    }
  }

  async function registerPhoneNumber(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyAction('register')
    setActionStatus(null)
    try {
      const response = await fetch('/api/whatsapp/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, pin: registrationPin }),
      })
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar el número')
      setActionStatus(payload?.message || 'Número registrado correctamente')
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'No se pudo registrar el número')
    } finally {
      setBusyAction(null)
    }
  }

  async function sendTestMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyAction('message')
    setActionStatus(null)
    try {
      const response = await fetch('/api/whatsapp/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, to: recipient, text: testMessage }),
      })
      const payload = (await response.json().catch(() => null)) as {
        message?: string
        error?: string
        result?: { messages?: Array<{ id?: string }> }
      } | null
      if (!response.ok) throw new Error(payload?.error || 'No se pudo enviar el mensaje')
      const messageId = payload?.result?.messages?.[0]?.id
      setActionStatus(messageId ? `Mensaje aceptado por Meta. ID: ${messageId}` : 'Mensaje enviado a WhatsApp')
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'No se pudo enviar el mensaje')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">WhatsApp</p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {isReady ? 'WhatsApp listo para operar' : isConnected ? 'WhatsApp conectado, falta completar Embedded Signup' : 'WhatsApp pendiente'}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {isReady
              ? 'La app ya tiene la WABA y el número. El siguiente paso es suscribir el webhook, registrar el número y probar un mensaje.'
              : 'El cliente debe completar el flujo oficial de Meta. La app captura los IDs automáticamente cuando Meta finaliza Embedded Signup.'}
          </p>
        </div>
        <div className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] ${
          isReady
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
        }`}>
          {isReady ? 'Operativo' : 'Requiere Embedded Signup'}
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
        <StatusItem label="Conexión Meta" value={isConnected ? 'Guardada' : 'Pendiente'} tone={isConnected ? 'ok' : 'pending'} />
        <StatusItem label="WABA" value={connection?.waba_id ?? 'Pendiente'} tone={connection?.waba_id ? 'ok' : 'pending'} />
        <StatusItem label="Número WhatsApp" value={connection?.phone_number_id ?? 'Pendiente'} tone={connection?.phone_number_id ? 'ok' : 'pending'} />
      </div>

      {!isReady && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reconnect}
            className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-300"
          >
            Completar con Embedded Signup
          </button>
          <p className="text-sm text-slate-400">No hay campos manuales para el cliente.</p>
        </div>
      )}

      {isReady && (
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Webhook</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Suscribe esta WABA al webhook configurado en Meta para recibir mensajes y estados.
            </p>
            <button
              type="button"
              onClick={subscribeWebhook}
              disabled={busyAction !== null}
              className="mt-4 rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'subscribe' ? 'Suscribiendo...' : 'Suscribir webhook'}
            </button>
          </div>

          <form onSubmit={registerPhoneNumber} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Registro Cloud API</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Registra el número y define el PIN de verificación en dos pasos.
            </p>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">PIN de 6 dígitos</span>
              <input
                value={registrationPin}
                onChange={event => setRegistrationPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="123456"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
              />
            </label>
            <button
              type="submit"
              disabled={busyAction !== null || registrationPin.length !== 6}
              className="mt-4 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'register' ? 'Registrando...' : 'Registrar número'}
            </button>
          </form>

          <form onSubmit={sendTestMessage} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Mensaje de prueba</div>
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Destino</span>
                <input
                  value={recipient}
                  onChange={event => setRecipient(event.target.value)}
                  placeholder="Ej: 573001112233"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Texto</span>
                <textarea
                  value={testMessage}
                  onChange={event => setTestMessage(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busyAction !== null || !recipient || !testMessage}
              className="mt-4 rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'message' ? 'Enviando...' : 'Enviar mensaje de prueba'}
            </button>
          </form>
        </div>
      )}

      {actionStatus && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-200">
          {actionStatus}
        </div>
      )}

      {webhookEvents.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Respuestas recientes</div>
          <div className="mt-3 grid gap-2">
            {webhookEvents.slice(0, 5).map(event => (
              <div
                key={event.id}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-100">{event.eventType}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{event.receivedAt}</span>
                </div>
                {event.content && <p className="mt-2 text-slate-200">{event.content}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>{event.status ?? 'sin estado'}</span>
                  <span className="break-all">{event.messageId ?? event.from ?? 'sin id'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function StatusItem({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'pending' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={tone === 'ok' ? 'mt-2 break-all text-sm text-emerald-200' : 'mt-2 break-all text-sm text-amber-100'}>
        {value}
      </div>
    </div>
  )
}
