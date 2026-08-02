import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { initThreadsAuth, THREADS_SCOPES } from '@/lib/social/threads'

/**
 * GET /api/social/oauth/threads/init?clientId=<uuid>
 * Threads reuses the Meta App (META_APP_ID / META_APP_SECRET) but has its
 * own dedicated redirect URI (THREADS_REDIRECT_URI).
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  if (!(await getCmClientAccess(request, clientId))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const metaAppId = process.env.META_APP_ID
  const redirectUri = process.env.THREADS_REDIRECT_URI
  if (!metaAppId || !redirectUri) {
    return NextResponse.json({ error: 'Threads no configurado' }, { status: 500 })
  }

  const state = `${clientId}:${crypto.randomBytes(16).toString('hex')}`
  const { error: stateErr } = await supabaseAdmin
    .from('cm_oauth_states')
    .insert({ state, client_id: clientId })
  if (stateErr) {
    return NextResponse.json(
      { error: `No se pudo persistir el state: ${stateErr.message}` },
      { status: 500 },
    )
  }

  const authUrl = initThreadsAuth(metaAppId, redirectUri, THREADS_SCOPES, state)
  return NextResponse.redirect(authUrl)
}
