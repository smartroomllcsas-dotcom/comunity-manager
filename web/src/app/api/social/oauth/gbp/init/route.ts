import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { initGBPAuth, GBP_SCOPES } from '@/lib/social/gbp'

/**
 * GET /api/social/oauth/gbp/init?clientId=<uuid>
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  if (!(await getCmClientAccess(request, clientId))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const gbpClientId = process.env.GBP_CLIENT_ID
  const redirectUri = process.env.GBP_REDIRECT_URI
  if (!gbpClientId || !redirectUri) {
    return NextResponse.json({ error: 'Google Business Profile no configurado' }, { status: 500 })
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

  const authUrl = initGBPAuth(gbpClientId, redirectUri, GBP_SCOPES, state)
  return NextResponse.redirect(authUrl)
}
