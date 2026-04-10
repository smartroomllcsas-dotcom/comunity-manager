import { NextRequest, NextResponse } from 'next/server'
import { publishToFacebook, publishToInstagram } from '@/lib/meta'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clientId, message, imageUrl, platforms, scheduledTime } = body

  if (!clientId || !message) {
    return NextResponse.json({ error: 'clientId y message son requeridos' }, { status: 400 })
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
  const targetPlatforms = platforms || ['facebook', 'instagram']

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

  return NextResponse.json({ results })
}
