'use client'

import { useEffect, useRef, useState } from 'react'

const CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || ''
const SCOPE = 'whatsapp_business_management,whatsapp_business_messaging,business_management'

interface FBLoginCodeResponse {
  authResponse: { code: string } | null
  status: string
}

interface FBLoginCodeAPI {
  login: (
    cb: (response: FBLoginCodeResponse) => void,
    options: {
      config_id: string
      response_type: 'code'
      auth_type?: 'rerequest'
      scope?: string
      override_default_response_type?: boolean
    }
  ) => void
}

interface ExchangeResult {
  success?: boolean
  waba_id?: string
  phone_number_id?: string
  display_phone_number?: string
  verified_name?: string
  access_token_preview?: string
  error?: string
}

interface WAEmbeddedSignupData {
  type: 'WA_EMBEDDED_SIGNUP'
  event: 'FINISH' | 'FINISH_ONLY_WABA' | 'CANCEL' | string
  data?: { phone_number_id?: string; waba_id?: string }
  version?: number
}

export default function WhatsAppConnectButton() {
  const [sdkReady, setSdkReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExchangeResult | null>(null)
  const signupDataRef = useRef<{ phone_number_id?: string; waba_id?: string } | null>(null)

  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined' && window.FB) {
        setSdkReady(true)
        return true
      }
      return false
    }
    if (check()) return
    const interval = setInterval(() => {
      if (check()) clearInterval(interval)
    }, 250)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
        return
      }
      try {
        const parsed: WAEmbeddedSignupData =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (parsed.type === 'WA_EMBEDDED_SIGNUP' && parsed.event === 'FINISH' && parsed.data) {
          signupDataRef.current = {
            phone_number_id: parsed.data.phone_number_id,
            waba_id: parsed.data.waba_id,
          }
        }
      } catch {
        // ignore non-JSON or unrelated messages
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const handleConnect = () => {
    if (!CONFIG_ID) {
      setResult({ error: 'NEXT_PUBLIC_WHATSAPP_CONFIG_ID no está configurada' })
      return
    }
    if (!window.FB) {
      setResult({ error: 'SDK de Facebook no cargado' })
      return
    }
    setLoading(true)
    setResult(null)
    signupDataRef.current = null

    const fbLogin = window.FB as unknown as FBLoginCodeAPI
    fbLogin.login(
      async (response) => {
        if (!response.authResponse?.code) {
          setLoading(false)
          setResult({ error: response.status === 'unknown' ? 'Login cancelado' : `Status: ${response.status}` })
          return
        }
        const code = response.authResponse.code
        const signupData = signupDataRef.current

        if (!signupData?.phone_number_id || !signupData?.waba_id) {
          setLoading(false)
          setResult({
            error:
              'No se recibió phone_number_id / waba_id desde el flujo de Embedded Signup. ¿Se completó el wizard hasta el final?',
          })
          return
        }

        try {
          const res = await fetch('/auth/whatsapp/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              phone_number_id: signupData.phone_number_id,
              waba_id: signupData.waba_id,
            }),
          })
          const data: ExchangeResult = await res.json()
          setResult(data)
        } catch (err) {
          setResult({ error: err instanceof Error ? err.message : 'Error de red' })
        } finally {
          setLoading(false)
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        auth_type: 'rerequest',
        scope: SCOPE,
        override_default_response_type: true,
      }
    )
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleConnect}
        disabled={!sdkReady || loading}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#25D366] hover:bg-[#1ebe5a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
        </svg>
        {loading ? 'Conectando...' : sdkReady ? 'Conectar WhatsApp' : 'Cargando SDK...'}
      </button>

      {result && (
        <div
          className={`rounded-md border p-4 text-sm ${
            result.success
              ? 'border-emerald-700/40 bg-emerald-950/40 text-emerald-200'
              : 'border-rose-700/40 bg-rose-950/40 text-rose-200'
          }`}
        >
          {result.error ? (
            <p>⚠ {result.error}</p>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">✓ WhatsApp conectado</p>
              <p>
                WABA ID: <span className="font-mono">{result.waba_id}</span>
              </p>
              <p>
                Phone Number ID: <span className="font-mono">{result.phone_number_id}</span>
              </p>
              {result.display_phone_number && (
                <p>
                  Número: <span className="font-mono">{result.display_phone_number}</span>
                </p>
              )}
              {result.verified_name && (
                <p>
                  Nombre verificado: <span className="font-mono">{result.verified_name}</span>
                </p>
              )}
              <p className="break-all">
                Token: <span className="font-mono">{result.access_token_preview}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
