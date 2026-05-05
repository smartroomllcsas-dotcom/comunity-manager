'use client'

import { useSearchParams } from 'next/navigation'

export default function IGCallbackResult() {
  const params = useSearchParams()
  const success = params.get('ig_success')
  const error = params.get('ig_error')

  if (!success && !error) return null

  if (error) {
    return (
      <div className="mt-4 rounded-md border border-rose-700/40 bg-rose-950/40 p-4 text-sm text-rose-200">
        <p className="font-medium">⚠ Error de Instagram</p>
        <p className="font-mono break-all">{error}</p>
        {params.get('ig_error_reason') && (
          <p className="text-rose-300 mt-1">Razón: {params.get('ig_error_reason')}</p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-md border border-emerald-700/40 bg-emerald-950/40 p-4 text-sm text-emerald-200 space-y-1">
      <p className="font-medium">✓ Instagram conectado</p>
      <p>
        Username: <span className="font-mono">@{params.get('ig_username')}</span>
      </p>
      <p>
        IG User ID: <span className="font-mono">{params.get('ig_user_id')}</span>
      </p>
      {params.get('ig_account_type') && (
        <p>
          Tipo de cuenta: <span className="font-mono">{params.get('ig_account_type')}</span>
        </p>
      )}
      <p className="break-all">
        Token (recortado): <span className="font-mono">{params.get('ig_token_preview')}…</span>
      </p>
      {params.get('ig_expires_in') && Number(params.get('ig_expires_in')) > 0 && (
        <p>
          Expira en: <span className="font-mono">{params.get('ig_expires_in')}s</span> (~
          {Math.round(Number(params.get('ig_expires_in')) / 86400)} días)
        </p>
      )}
    </div>
  )
}
