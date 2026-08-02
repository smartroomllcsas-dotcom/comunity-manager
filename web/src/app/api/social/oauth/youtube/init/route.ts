import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { initYouTubeAuth, YOUTUBE_SCOPES } from '@/lib/social/youtube'

/**
 * GET /api/social/oauth/youtube/init?clientId=<uuid>
 * Redirects the user to Google's authorization page with a signed state.
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  if (!(await getCmClientAccess(request, clientId))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const ytClientId = process.env.YOUTUBE_CLIENT_ID
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI
  if (!ytClientId || !redirectUri) {
    return NextResponse.json({ error: 'YouTube API no configurada' }, { status: 500 })
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

  const authUrl = initYouTubeAuth(ytClientId, redirectUri, YOUTUBE_SCOPES, state)
  return NextResponse.redirect(authUrl)
}
