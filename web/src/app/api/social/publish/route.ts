import { NextRequest, NextResponse } from 'next/server'
import { publishToFacebook, publishToInstagram } from '@/lib/meta'
import { supabase } from '@/lib/supabase'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { BILLING_FEATURES } from '@/lib/billing/features'
import {
  billingDeniedResponse,
  checkBillingFeature,
  recordBillingUsage,
} from '@/lib/billing/service'
import { randomUUID } from 'node:crypto'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clientId, message, imageUrl, platforms, scheduledTime } = body

  if (!clientId || !message) {
    return NextResponse.json({ error: 'clientId y message son requeridos' }, { status: 400 })
  }
  const targetPlatforms = Array.isArray(platforms)
    ? [...new Set(platforms.filter((platform) => platform === 'facebook' || platform === 'instagram'))]
    : ['facebook', 'instagram']
  if (targetPlatforms.length === 0) {
    return NextResponse.json({ error: 'Debes seleccionar una plataforma compatible' }, { status: 400 })
  }
  const access = await getCmClientAccess(req, clientId)
  if (!access) {
    return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })
  }
  const billingDecision = access.organizationId
    ? await checkBillingFeature({
        organizationId: access.organizationId,
        featureCode: BILLING_FEATURES.POSTS_MONTH,
        requestedUnits: targetPlatforms.length,
        source: 'api/social/publish',
      })
    : null
  if (billingDecision && !billingDecision.allowed) {
    return billingDeniedResponse(billingDecision)
  }

  // Get social account for this client
  const { data: social, error: socialError } = await supabase
    .from('cm_social_accounts')
    .select('*')
    .eq('client_id', clientId)
    .single()

  if (socialError || !social) {
    return NextResponse.json({ error: 'Cliente no tiene redes conectadas' }, { status: 400 })
  }

  const results: Record<string, any> = {}

  // Publish to Facebook
  if (targetPlatforms.includes('facebook') && social.page_id) {
    try {
      const fbResult = await publishToFacebook(social.page_id, social.page_access_token, {
        message,
        imageUrl,
        scheduledTime,
      })
      results.facebook = { success: true, postId: fbResult.id }
    } catch (err: any) {
      results.facebook = { success: false, error: err.message }
    }
  }

  // Publish to Instagram
  if (targetPlatforms.includes('instagram') && social.instagram_id) {
    try {
      if (!imageUrl) {
        results.instagram = { success: false, error: 'Instagram requiere una imagen o video' }
      } else {
        const igResult = await publishToInstagram(social.instagram_id, social.page_access_token, {
          caption: message,
          imageUrl,
        })
        results.instagram = { success: true, postId: igResult.id }
      }
    } catch (err: any) {
      results.instagram = { success: false, error: err.message }
    }
  }

  // Log activity
  const { data: client } = await supabase.from('cm_clients').select('user_id, name').eq('id', clientId).single()
  if (client) {
    const successPlatforms = Object.entries(results).filter(([, r]) => r.success).map(([p]) => p)
    if (successPlatforms.length > 0) {
      await supabase.from('cm_activity_log').insert({
        user_id: client.user_id,
        action: `Contenido publicado en ${successPlatforms.join(' + ')} para ${client.name}`,
        status: 'success',
      })
    }
  }

  if (access.organizationId && billingDecision) {
    const successfulPosts = Object.values(results).filter(
      (result: any) => result.success
    ).length
    if (successfulPosts > 0) {
      const providerPostIds = Object.values(results)
        .filter((result: any) => result.success && result.postId)
        .map((result: any) => String(result.postId))
        .sort()
      await recordBillingUsage({
        organizationId: access.organizationId,
        featureCode: BILLING_FEATURES.POSTS_MONTH,
        quantity: successfulPosts,
        idempotencyKey: `social:${clientId}:${providerPostIds.join(':') || randomUUID()}`,
        sourceType: 'social_publish',
        sourceId: clientId,
        periodStart: billingDecision.periodStart,
        periodEnd: billingDecision.periodEnd,
      })
    }
  }

  return NextResponse.json({ results })
}
