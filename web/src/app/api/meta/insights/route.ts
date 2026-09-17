/**
 * Resultados de la cuenta publicitaria y de la página de UNA empresa.
 *
 * Antes, cuando faltaba algo, rellenaba con `DEFAULT_INSIGHTS` y respondía
 * `source: 'meta'`: cifras inventadas presentadas como reales, que es lo peor
 * que puede hacer un informe. Ahora, si no hay datos, se dice por qué.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdInsights, getPageInsights, AD_DATE_PRESETS, type AdInsightsRange, type AdDatePreset } from '@/lib/meta'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveToken } from '@/lib/auth/token-crypto'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { resolveAdsSource } from '@/lib/meta/ads-source'

type Metric = { name: string; value: string | number }

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Periodo pedido por la pantalla. Se valida aquí porque va directo a Meta:
 * `?range=last_30d`, o `?since=2026-08-01&until=2026-08-31`.
 */
function readRange(params: URLSearchParams): { range: AdInsightsRange; label: string } {
  const since = params.get('since')
  const until = params.get('until')
  if (since && until && YMD.test(since) && YMD.test(until) && since <= until) {
    return { range: { since, until }, label: `${since} a ${until}` }
  }
  const preset = params.get('range') as AdDatePreset | null
  if (preset && (AD_DATE_PRESETS as readonly string[]).includes(preset)) {
    return { range: { preset }, label: preset }
  }
  return { range: { preset: 'last_7d' }, label: 'last_7d' }
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  const access = await getCmClientAccess(request, clientId)
  if (!access) {
    return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })
  }

  const { range, label } = readRange(request.nextUrl.searchParams)
  const insights: Metric[] = []
  const response: Record<string, unknown> = { range: label }
  const notes: string[] = []

  // ── Anuncios ───────────────────────────────────────────────────────────────
  const source = await resolveAdsSource(access.clientId)
  if (!source.ok) {
    notes.push(source.reason)
    response.needsConnect = source.needsConnect
  } else {
    try {
      const adsInsights = await getAdInsights(source.adAccountId, source.token, range)
      const row = adsInsights.data?.[0]
      if (row) {
        if (row.spend != null) insights.push({ name: 'Inversión', value: Number(row.spend) || 0 })
        if (row.impressions != null) insights.push({ name: 'Impresiones', value: Number(row.impressions) || 0 })
        if (row.clicks != null) insights.push({ name: 'Clics', value: Number(row.clicks) || 0 })
        if (row.ctr != null) insights.push({ name: 'CTR', value: Number(row.ctr) || 0 })
        if (row.cpc != null) insights.push({ name: 'Costo por clic', value: Number(row.cpc) || 0 })
        if (row.reach != null) insights.push({ name: 'Personas alcanzadas', value: Number(row.reach) || 0 })
      } else {
        notes.push('La cuenta publicitaria no registró actividad en el periodo elegido.')
      }
      response.ads = adsInsights.data ?? []
      response.adAccountId = source.adAccountId
    } catch (error) {
      notes.push(error instanceof Error ? error.message : 'Meta no respondió por los anuncios')
    }
  }

  // ── Página de Facebook ─────────────────────────────────────────────────────
  try {
    const pub = createAdminClient('public')
    const { data: social } = await pub
      .from('cm_social_accounts')
      .select('page_id, page_access_token, page_access_token_ciphertext')
      .eq('client_id', access.clientId)
      .maybeSingle()
    const row = social as Record<string, unknown> | null
    const pageToken = row
      ? resolveToken(
          row.page_access_token_ciphertext as string | null,
          row.page_access_token as string | null
        )
      : null
    if (row?.page_id && pageToken) {
      response.page = (await getPageInsights(row.page_id as string, pageToken, range)).data ?? []
    }
  } catch {
    response.page = []
  }

  return NextResponse.json({
    source: insights.length > 0 ? 'meta' : 'none',
    insights,
    reason: notes.length > 0 ? notes.join(' ') : null,
    ...response,
  })
}
