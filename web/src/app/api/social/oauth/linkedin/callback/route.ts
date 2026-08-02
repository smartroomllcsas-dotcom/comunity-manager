import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/crypto'
import {
  exchangeLinkedInCode,
  getLinkedInMemberUrn,
  listLinkedInOrgs,
  LINKEDIN_SCOPES,
} from '@/lib/social/linkedin'

/**
 * GET /api/social/oauth/linkedin/callback
 *
 * Persists the personal member URN as the primary account row. If the member
 * administers any organizations, we also persist one row per company page
 * (platform='linkedin', account_id = organization URN).
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')

  if (err) {
    return NextResponse.redirect(
      `${appUrl}/clients?linkedin_error=${encodeURIComponent(err)}`,
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?linkedin_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabaseAdmin
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?linkedin_error=Estado+invalido`)
  }
  const clientId: string = oauthState.client_id
  await supabaseAdmin.from('cm_oauth_states').delete().eq('state', state)

  const linkedInClientId = process.env.LINKEDIN_CLIENT_ID
  const linkedInSecret = process.env.LINKEDIN_CLIENT_SECRET
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI
  if (!linkedInClientId || !linkedInSecret || !redirectUri) {
    return NextResponse.redirect(
      `${appUrl}/clients?linkedin_error=LinkedIn+no+configurado`,
    )
  }

  try {
    const tok = await exchangeLinkedInCode(
      code,
      linkedInClientId,
      linkedInSecret,
      redirectUri,
    )
    const member = await getLinkedInMemberUrn(tok.access_token)
    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()
    const cipherAccess = encryptToken(tok.access_token)
    const cipherRefresh = tok.refresh_token ? encryptToken(tok.refresh_token) : null

    const basePayload = {
      client_id: clientId,
      platform: 'linkedin',
      access_token_ciphertext: cipherAccess,
      refresh_token_encrypted: cipherRefresh,
      token_expires_at: expiresAt,
      scopes: [...LINKEDIN_SCOPES],
      status: 'active',
      updated_at: new Date().toISOString(),
    }

    // 1. Personal member row.
    const personalPayload = {
      ...basePayload,
      account_id: member.urn,
      account_name: member.name,
      metadata: {
        author_type: 'PERSONAL',
        email: member.email ?? null,
        picture: member.picture ?? null,
        connected_at: new Date().toISOString(),
      },
    }
    const { data: existingPersonal } = await supabaseAdmin
      .from('cm_social_accounts')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'linkedin')
      .eq('account_id', member.urn)
      .maybeSingle()
    if (existingPersonal) {
      await supabaseAdmin.from('cm_social_accounts').update(personalPayload).eq('id', existingPersonal.id)
    } else {
      await supabaseAdmin.from('cm_social_accounts').insert(personalPayload)
    }

    // 2. Optional organization rows (best-effort).
    try {
      const orgs = await listLinkedInOrgs(tok.access_token)
      for (const org of orgs) {
        const orgPayload = {
          ...basePayload,
          account_id: org.urn,
          account_name: org.name ?? `Company ${org.id}`,
          metadata: {
            author_type: 'ORGANIZATION',
            role: org.role,
            org_id: org.id,
            connected_at: new Date().toISOString(),
          },
        }
        const { data: existingOrg } = await supabaseAdmin
          .from('cm_social_accounts')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'linkedin')
          .eq('account_id', org.urn)
          .maybeSingle()
        if (existingOrg) {
          await supabaseAdmin.from('cm_social_accounts').update(orgPayload).eq('id', existingOrg.id)
        } else {
          await supabaseAdmin.from('cm_social_accounts').insert(orgPayload)
        }
      }
    } catch (orgErr) {
      console.warn('[linkedin-oauth] org discovery failed:', orgErr)
    }

    return NextResponse.redirect(`${appUrl}/clients?linkedin_ok=1`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[linkedin-oauth] callback failed:', msg)
    return NextResponse.redirect(
      `${appUrl}/clients?linkedin_error=${encodeURIComponent('Fallo autenticacion')}`,
    )
  }
}
