import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  getOAuthUrl,
  exchangeCodeForToken,
  getLongLivedToken,
  getUserPages,
  getUserProfile,
} from '@/lib/meta'
import { supabase } from '@/lib/supabase'

export async function initiateMetaOAuth(request: NextRequest, callbackPath: string) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.json({ error: 'Meta API no configurada' }, { status: 500 })
  }

  const state = `${clientId}:${crypto.randomBytes(16).toString('hex')}`
  await supabase.from('cm_oauth_states').insert({ state, client_id: clientId })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const redirectUri = `${appUrl}${callbackPath}`
  const authUrl = getOAuthUrl(redirectUri, state)
  return NextResponse.redirect(authUrl)
}

export async function handleMetaCallback(request: NextRequest, callbackPath: string) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  if (error) {
    return NextResponse.redirect(`${appUrl}/clients?meta_error=Autorizacion+cancelada`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?meta_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabase
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?meta_error=Estado+invalido`)
  }
  const clientId = oauthState.client_id
  await supabase.from('cm_oauth_states').delete().eq('state', state)

  try {
    const redirectUri = `${appUrl}${callbackPath}`
    const shortToken = await exchangeCodeForToken(code, redirectUri)
    const longToken = await getLongLivedToken(shortToken.access_token)
    const profile = await getUserProfile(longToken.access_token)
    const pages = await getUserPages(longToken.access_token)

    if (pages.length === 0) {
      return NextResponse.redirect(`${appUrl}/clients?meta_error=No+se+encontraron+paginas+de+Facebook`)
    }

    const page = pages[0]
    const igAccount = page.instagram_business_account
    const tokenExpires = new Date()
    tokenExpires.setSeconds(tokenExpires.getSeconds() + (longToken.expires_in || 5184000))

    const { data: existing } = await supabase
      .from('cm_social_accounts')
      .select('id')
      .eq('client_id', clientId)
      .single()

    const socialData = {
      client_id: clientId,
      page_id: page.id,
      page_name: page.name,
      page_access_token: page.access_token,
      instagram_id: igAccount?.id || null,
      instagram_username: igAccount?.username || null,
      meta_user_id: profile.id,
      connected_at: new Date().toISOString(),
      token_expires_at: tokenExpires.toISOString(),
    }

    if (existing) {
      await supabase.from('cm_social_accounts').update(socialData).eq('id', existing.id)
    } else {
      await supabase.from('cm_social_accounts').insert(socialData)
    }

    const { data: client } = await supabase
      .from('cm_clients')
      .select('user_id, name')
      .eq('id', clientId)
      .single()
    if (client) {
      await supabase.from('cm_activity_log').insert({
        user_id: client.user_id,
        action: `Redes conectadas: ${page.name}${igAccount ? ` + @${igAccount.username}` : ''} para ${client.name}`,
        status: 'success',
      })
    }

    const successMsg = `Conectado: ${page.name}${igAccount ? ` + @${igAccount.username}` : ''}`
    return NextResponse.redirect(`${appUrl}/clients?meta_success=${encodeURIComponent(successMsg)}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('Meta OAuth error:', msg)
    return NextResponse.redirect(`${appUrl}/clients?meta_error=${encodeURIComponent(msg)}`)
  }
}
