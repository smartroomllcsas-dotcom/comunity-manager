import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { initPinterestAuth, PINTEREST_SCOPES } from '@/lib/social/pinterest'

/**
 * GET /api/social/oauth/pinterest/init?clientId=<uuid>
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  if (!(await getCmClientAccess(request, clientId))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const appId = process.env.PINTEREST_APP_ID
  const redirectUri = process.env.PINTEREST_REDIRECT_URI
  if (!appId || !redirectUri) {
    return NextResponse.json({ error: 'Pinterest API no configurada' }, { status: 500 })
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

  const authUrl = initPinterestAuth(appId, redirectUri, PINTEREST_SCOPES, state)
  return NextResponse.redirect(authUrl)
}
