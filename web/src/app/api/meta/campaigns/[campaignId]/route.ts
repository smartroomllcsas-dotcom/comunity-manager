import { NextRequest, NextResponse } from 'next/server'
import {
  AD_DATE_PRESETS,
  getAdCampaignDetails,
  type AdInsightsRange,
  type AdDatePreset,
} from '@/lib/meta'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { resolveAdsSource } from '@/lib/meta/ads-source'

const YMD = /^\d{4}-\d{2}-\d{2}$/

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (typeof item === 'number') return [String(item)]
    const row = asRecord(item)
    if (!row) return []
    const label = asString(row.name) || asString(row.title) || asString(row.id)
    return label ? [label] : []
  })
}

function collectTargetingLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const label = asString(row.name) || asString(row.title) || asString(row.id)
    return label ? [label] : []
  })
}

function collectSpecGroup(targeting: JsonRecord, groupKey: 'flexible_spec' | 'exclusions', key: string): string[] {
  const groups = targeting[groupKey]
  if (!Array.isArray(groups)) return []
  return groups.flatMap((item) => collectTargetingLabels(asRecord(item)?.[key]))
}

function normalizeLocations(value: unknown): string[] {
  const geo = asRecord(value)
  if (!geo) return []
  const labels: string[] = []
  for (const key of ['countries', 'regions', 'cities', 'zips', 'custom_locations']) {
    const rows = geo[key]
    if (!Array.isArray(rows)) continue
    for (const item of rows) {
      if (typeof item === 'string') {
        labels.push(item)
        continue
      }
      const row = asRecord(item)
      if (!row) continue
      const label = [row.name, row.region, row.country, row.key]
        .map(asString)
        .filter((part): part is string => Boolean(part))
        .join(' · ')
      if (label) labels.push(label)
    }
  }
  return labels
}

function normalizeTargeting(value: unknown) {
  const targeting = asRecord(value)
  if (!targeting) return null
  const genders = asStringArray(targeting.genders).map((gender) => {
    if (gender === '1') return 'Hombres'
    if (gender === '2') return 'Mujeres'
    return gender
  })
  const interests = collectSpecGroup(targeting, 'flexible_spec', 'interests')
  const behaviors = collectSpecGroup(targeting, 'flexible_spec', 'behaviors')
  const demographics = collectSpecGroup(targeting, 'flexible_spec', 'demographics')
  const exclusions = [
    ...collectSpecGroup(targeting, 'exclusions', 'interests'),
    ...collectSpecGroup(targeting, 'exclusions', 'behaviors'),
    ...collectSpecGroup(targeting, 'exclusions', 'demographics'),
  ]

  return {
    ageMin: typeof targeting.age_min === 'number' ? targeting.age_min : null,
    ageMax: typeof targeting.age_max === 'number' ? targeting.age_max : null,
    genders,
    locations: normalizeLocations(targeting.geo_locations),
    interests,
    behaviors,
    demographics,
    exclusions,
    devicePlatforms: asStringArray(targeting.device_platforms),
    publisherPlatforms: asStringArray(targeting.publisher_platforms),
    facebookPositions: asStringArray(targeting.facebook_positions),
    instagramPositions: asStringArray(targeting.instagram_positions),
    locales: asStringArray(targeting.locales),
  }
}

function normalizeInsight(value: unknown) {
  const row = asRecord(value)
  if (!row) return null
  return {
    spend: row.spend ?? null,
    impressions: row.impressions ?? null,
    reach: row.reach ?? null,
    clicks: row.clicks ?? null,
    ctr: row.ctr ?? null,
    cpc: row.cpc ?? null,
    frequency: row.frequency ?? null,
    dateStart: row.date_start ?? null,
    dateStop: row.date_stop ?? null,
    actions: Array.isArray(row.actions)
      ? row.actions.slice(0, 40).flatMap((action) => {
          const item = asRecord(action)
          if (!item) return []
          return [{ type: item.action_type ?? null, value: item.value ?? null }]
        })
      : [],
  }
}

function normalizeCreative(value: unknown) {
  const creative = asRecord(value)
  if (!creative) return null
  const story = asRecord(creative.object_story_spec)
  const linkData = asRecord(story?.link_data)
  const videoData = asRecord(story?.video_data)
  const photoData = asRecord(story?.photo_data)
  const callToAction = asRecord(linkData?.call_to_action) || asRecord(videoData?.call_to_action)
  const callToActionValue = asRecord(callToAction?.value)

  return {
    id: asString(creative.id),
    name: asString(creative.name),
    format: asString(creative.object_type) || (videoData ? 'VIDEO' : photoData ? 'PHOTO' : 'LINK'),
    primaryText: asString(linkData?.message) || asString(videoData?.message) || asString(photoData?.caption),
    headline: asString(linkData?.name) || asString(videoData?.title),
    description: asString(linkData?.description) || asString(videoData?.description),
    destinationUrl: asString(linkData?.link) || asString(callToActionValue?.link),
    imageUrl:
      asString(linkData?.picture) ||
      asString(videoData?.image_url) ||
      asString(photoData?.image_url) ||
      asString(creative.image_url) ||
      asString(creative.thumbnail_url),
    thumbnailUrl: asString(creative.thumbnail_url),
    videoId: asString(videoData?.video_id) || asString(creative.video_id),
    previewUrl: asString(creative.preview_shareable_link),
  }
}

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
  return { range: { preset: 'last_30d' }, label: 'last_30d' }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await context.params
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  if (!/^\d+$/.test(campaignId)) return NextResponse.json({ error: 'campaignId inválido' }, { status: 400 })

  const access = await getCmClientAccess(request, clientId)
  if (!access) return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })

  const source = await resolveAdsSource(access.clientId)
  if (!source.ok) {
    return NextResponse.json({ error: source.reason, needsConnect: source.needsConnect }, { status: 409 })
  }

  const { range, label } = readRange(request.nextUrl.searchParams)
  try {
    const detail = await getAdCampaignDetails(campaignId, source.token, range)
    const campaign = asRecord(detail.campaign)
    if (!campaign) return NextResponse.json({ error: 'Meta no devolvió la campaña' }, { status: 502 })

    // El token puede tener acceso a más de una cuenta. Nunca mostramos una
    // campaña que no pertenezca a la cuenta publicitaria de esta marca.
    const campaignAccountId = asString(campaign.account_id)
    const normalizedCampaignAccountId = campaignAccountId?.replace(/^act_/, '')
    const normalizedSourceAccountId = source.adAccountId.replace(/^act_/, '')
    if (!normalizedCampaignAccountId || normalizedCampaignAccountId !== normalizedSourceAccountId) {
      return NextResponse.json({ error: 'La campaña no pertenece a esta marca' }, { status: 404 })
    }

    const adSetInsights = Array.isArray(detail.insights.adsets) ? detail.insights.adsets : []
    const adInsights = Array.isArray(detail.insights.ads) ? detail.insights.ads : []
    const byId = (rows: unknown[], id: unknown, key: string) =>
      rows.find((row) => asRecord(row)?.[key] && String(asRecord(row)?.[key]) === String(id)) ?? null

    return NextResponse.json({
      source: source.origin,
      adAccountId: source.adAccountId,
      range: label,
      campaign: {
        id: asString(campaign.id),
        name: asString(campaign.name),
        status: asString(campaign.status),
        effectiveStatus: asString(campaign.effective_status),
        configuredStatus: asString(campaign.configured_status),
        objective: asString(campaign.objective),
        buyingType: asString(campaign.buying_type),
        specialAdCategories: asStringArray(campaign.special_ad_categories),
        dailyBudget: campaign.daily_budget ?? null,
        lifetimeBudget: campaign.lifetime_budget ?? null,
        startTime: campaign.start_time ?? null,
        stopTime: campaign.stop_time ?? null,
        createdTime: campaign.created_time ?? null,
        updatedTime: campaign.updated_time ?? null,
      },
      insights: {
        campaign: normalizeInsight(detail.insights.campaign),
      },
      adsets: detail.adsets.map((value: unknown) => {
        const adSet = asRecord(value) || {}
        const adSetId = adSet.id
        const ads = Array.isArray(adSet.ads) ? adSet.ads : []
        return {
          id: asString(adSet.id),
          name: asString(adSet.name),
          status: asString(adSet.status),
          effectiveStatus: asString(adSet.effective_status),
          targeting: normalizeTargeting(adSet.targeting),
          dailyBudget: adSet.daily_budget ?? null,
          lifetimeBudget: adSet.lifetime_budget ?? null,
          startTime: adSet.start_time ?? null,
          endTime: adSet.end_time ?? null,
          insights: normalizeInsight(byId(adSetInsights, adSetId, 'adset_id')),
          ads: ads.map((value) => {
            const ad = asRecord(value) || {}
            return {
              id: asString(ad.id),
              name: asString(ad.name),
              status: asString(ad.status),
              effectiveStatus: asString(ad.effective_status),
              insights: normalizeInsight(byId(adInsights, ad.id, 'ad_id')),
              creative: normalizeCreative(ad.creative),
            }
          }),
        }
      }),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Meta no respondió al detalle de la campaña' },
      { status: 502 },
    )
  }
}
