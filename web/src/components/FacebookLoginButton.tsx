'use client'

import { useEffect, useState } from 'react'

const SCOPE = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
].join(',')

type AuthResponse = {
  accessToken: string
  userID: string
  expiresIn: number
}

type LoginResult = {
  status: string
  user?: { id: string; name: string; email?: string }
  pages?: Array<{ id: string; name: string; instagram?: { id: string; username: string } | null }>
  authResponse?: AuthResponse
  error?: string
}

export default function FacebookLoginButton() {
  const [sdkReady, setSdkReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LoginResult | null>(null)

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

  const handleLogin = () => {
    if (!window.FB) {
      setResult({ status: 'error', error: 'SDK de Facebook no cargado' })
      return
    }
    setLoading(true)
    setResult(null)

    window.FB.login(
      (response) => {
        if (response.status !== 'connected' || !response.authResponse) {
          setLoading(false)
          setResult({
            status: response.status || 'cancelled',
            error:
              response.status === 'not_authorized'
                ? 'El usuario no autorizó la app'
                : 'Login cancelado o sin permisos',
          })
          return
        }

        const ar = response.authResponse
        if (!ar?.accessToken || !ar.userID || ar.expiresIn == null) {
          setLoading(false)
          setResult({ status: 'error', error: 'Respuesta de Meta incompleta' })
          return
        }
        const accessToken = ar.accessToken
        const auth: AuthResponse = {
          accessToken,
          userID: ar.userID,
          expiresIn: ar.expiresIn,
        }

        window.FB.api(
          '/me',
          { fields: 'id,name,email' },
          (user: { id: string; name: string; email?: string; error?: { message: string } }) => {
            if (user.error) {
              setLoading(false)
              setResult({ status: 'error', authResponse: auth, error: user.error.message })
              return
            }

            window.FB.api(
              '/me/accounts',
              { fields: 'id,name,instagram_business_account{id,username}', access_token: accessToken },
              (pagesRes: {
                data?: Array<{
                  id: string
                  name: string
                  instagram_business_account?: { id: string; username: string }
                }>
                error?: { message: string }
              }) => {
                setLoading(false)
                if (pagesRes.error) {
                  setResult({ status: 'connected', user, authResponse: auth, error: pagesRes.error.message })
                  return
                }
                const pages = (pagesRes.data || []).map((p) => ({
                  id: p.id,
                  name: p.name,
                  instagram: p.instagram_business_account
                    ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username }
                    : null,
                }))
                setResult({ status: 'connected', user, authResponse: auth, pages })
              }
            )
          }
        )
      },
      { scope: SCOPE, return_scopes: true }
    )
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleLogin}
        disabled={!sdkReady || loading}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        {loading ? 'Conectando...' : sdkReady ? 'Iniciar sesión con Facebook' : 'Cargando SDK...'}
      </button>

      {result && (
        <div
          className={`rounded-md border p-4 text-sm ${
            result.status === 'connected'
              ? 'border-emerald-700/40 bg-emerald-950/40 text-emerald-200'
              : 'border-rose-700/40 bg-rose-950/40 text-rose-200'
          }`}
        >
          <p className="font-medium mb-2">
            Estado: <span className="font-mono">{result.status}</span>
          </p>
          {result.error && <p className="text-rose-300 mb-2">⚠ {result.error}</p>}
          {result.user && (
            <p>
              Usuario: <span className="font-mono">{result.user.name}</span> (ID {result.user.id})
              {result.user.email ? ` · ${result.user.email}` : ''}
            </p>
          )}
          {result.authResponse && (
            <p className="break-all">
              Access token (recortado):{' '}
              <span className="font-mono">{result.authResponse.accessToken.slice(0, 24)}…</span> · expira en{' '}
              {result.authResponse.expiresIn}s
            </p>
          )}
          {result.pages && result.pages.length > 0 && (
            <div className="mt-2">
              <p className="font-medium">Páginas accesibles:</p>
              <ul className="list-disc list-inside">
                {result.pages.map((p) => (
                  <li key={p.id}>
                    {p.name} (FB {p.id}){p.instagram ? ` · IG @${p.instagram.username}` : ' · sin Instagram'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.pages && result.pages.length === 0 && (
            <p className="mt-2 text-amber-300">
              ⚠ El usuario no tiene páginas de Facebook accesibles, o no concedió el permiso{' '}
              <code>pages_show_list</code>.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
