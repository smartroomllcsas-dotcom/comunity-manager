import { NextRequest, NextResponse } from 'next/server'
import { getAdInsights, getPageInsights } from '@/lib/meta'
import { DEFAULT_INSIGHTS } from '@/lib/meta-fallbacks'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const { data: social } = await supabase
    .from('cm_social_accounts')
    .select('ad_account_id, page_id, page_access_token, access_token')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!social) {
    return NextResponse.json({ source: 'mock', insights: DEFAULT_INSIGHTS })
  }

  try {
    const response: Record<string, unknown> = {}
    const insights: Array<{ name: string; value: string | number }> = []

    if (social.ad_account_id && social.access_token) {
      const adsInsights = await getAdInsights(social.ad_account_id, social.access_token)
      const adRow = adsInsights.data?.[0]
      if (adRow) {
        if (adRow.spend != null) insights.push({ name: 'Spend', value: Number(adRow.spend) || 0 })
        if (adRow.impressions != null) insights.push({ name: 'Impressions', value: Number(adRow.impressions) || 0 })
        if (adRow.clicks != null) insights.push({ name: 'Clicks', value: Number(adRow.clicks) || 0 })
      }
      response.ads = adsInsights.data ?? []
    }

    if (social.page_id && social.page_access_token) {
      try {
        const pageInsights = await getPageInsights(social.page_id, social.page_access_token)
        response.page = pageInsights.data ?? []
      } catch {
        response.page = []
      }
    }

    if (insights.length === 0) {
      insights.push(...DEFAULT_INSIGHTS)
    }

    return NextResponse.json({ source: 'meta', insights, ...response })
  } catch (error) {
    return NextResponse.json(
      {
        source: 'mock',
        error: error instanceof Error ? error.message : 'Meta error',
        insights: DEFAULT_INSIGHTS,
      },
      { status: 200 }
    )
  }
}
