/**
 * Campañas de la cuenta publicitaria de UNA empresa.
 *
 * Antes, cuando no había cuenta ni token, devolvía campañas de ejemplo con
 * `source: 'mock'` y la pantalla las pintaba igual que las de verdad: números
 * inventados presentados como reales. Ahora devuelve la lista vacía y el
 * motivo, para que la pantalla diga qué falta.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdCampaigns } from '@/lib/meta'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { resolveAdsSource } from '@/lib/meta/ads-source'

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  const access = await getCmClientAccess(request, clientId)
  if (!access) {
    return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })
  }

  const source = await resolveAdsSource(access.clientId)
  if (!source.ok) {
    return NextResponse.json({
      source: 'none',
      campaigns: [],
      reason: source.reason,
      needsConnect: source.needsConnect,
    })
  }

  try {
    const campaigns = await getAdCampaigns(source.adAccountId, source.token)
    return NextResponse.json({
      source: source.origin,
      campaigns: campaigns.data ?? [],
      reason:
        (campaigns.data ?? []).length === 0
          ? 'Esta cuenta publicitaria no tiene campañas.'
          : null,
    })
  } catch (error) {
    return NextResponse.json({
      source: 'error',
      campaigns: [],
      reason: error instanceof Error ? error.message : 'Meta no respondió',
    })
  }
}
