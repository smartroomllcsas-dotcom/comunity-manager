import { NextRequest, NextResponse } from 'next/server'
import { getAdCampaigns } from '@/lib/meta'
import { DEFAULT_CAMPAIGNS } from '@/lib/meta-fallbacks'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const { data: social } = await supabase
    .from('cm_social_accounts')
    .select('ad_account_id, access_token')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!social?.ad_account_id || !social.access_token) {
    return NextResponse.json({ source: 'mock', campaigns: DEFAULT_CAMPAIGNS })
  }

  try {
    const campaigns = await getAdCampaigns(social.ad_account_id, social.access_token)
    const items = campaigns.data ?? []
    return NextResponse.json({
      source: items.length > 0 ? 'meta' : 'mock',
      campaigns: items.length > 0 ? items : DEFAULT_CAMPAIGNS,
    })
  } catch (error) {
    return NextResponse.json(
      {
        source: 'mock',
        error: error instanceof Error ? error.message : 'Meta error',
        campaigns: DEFAULT_CAMPAIGNS,
      },
      { status: 200 }
    )
  }
}
