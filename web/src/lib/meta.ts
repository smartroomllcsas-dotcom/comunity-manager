// =============================================================================
// Meta Graph API - OAuth & Content Publishing (Instagram + Facebook)
// =============================================================================

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com'

// Transient error codes that should be retried
const TRANSIENT_ERROR_CODES = [1, 2, 4, 17]
const TOKEN_EXPIRED_SUBCODES = [463, 467]
const INVALID_TOKEN_SUBCODE = 190

export interface MetaApiError {
  code: number
  subcode?: number
  message: string
  isTransient: boolean
  isTokenExpired: boolean
}

function parseMetaError(error: any): MetaApiError {
  return {
    code: error.code || 0,
    subcode: error.error_subcode,
    message: error.message || 'Error desconocido de Meta API',
    isTransient: TRANSIENT_ERROR_CODES.includes(error.code),
    isTokenExpired: TOKEN_EXPIRED_SUBCODES.includes(error.error_subcode) || error.code === INVALID_TOKEN_SUBCODE,
  }
}

async function metaFetch(url: string, options: RequestInit = {}, maxRetries = 3): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)

      if (res.status === 429) {
        if (attempt >= maxRetries) throw new Error('Meta API: límite de solicitudes excedido')
        const wait = Math.pow(2, attempt + 1) * 1000
        await new Promise(r => setTimeout(r, wait))
        continue
      }

      const data = await res.json()

      if (data.error) {
        const parsed = parseMetaError(data.error)
        if (parsed.isTokenExpired) {
          throw new Error('Token expirado. Reconecta tu cuenta de Meta.')
        }
        if (parsed.isTransient && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
          continue
        }
        throw new Error(`Meta API: ${parsed.message} (code: ${parsed.code})`)
      }

      return data
    } catch (error: any) {
      if (error.name === 'TypeError' && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000))
        continue
      }
      throw error
    }
  }
  throw new Error('Meta API: falló después de todos los reintentos')
}

// -----------------------------------------------------------------------------
// OAuth Flow
// -----------------------------------------------------------------------------

/** Nombre de la variable, en un solo sitio, para que los mensajes no diverjan. */
export const FACEBOOK_CONFIG_ID_ENV = 'META_FACEBOOK_CONFIG_ID'

export type FacebookConfigIdResult =
  | { ok: true; configId: string }
  | { ok: false; reason: 'missing' | 'invalid' }

/**
 * Lee y valida la configuración de Facebook Login for Business.
 *
 * El identificador **nunca** se escribe en el código: vive sólo en
 * `META_FACEBOOK_CONFIG_ID`. Esta función es el único punto que lo lee, de modo
 * que la validación no se puede saltar por descuido desde otra ruta.
 *
 * Se valida el formato, no sólo la presencia. Un valor con comillas, un
 * marcador de posición o el identificador de la app en lugar del de la
 * configuración producirían un diálogo de Meta que falla *después* de que el
 * usuario ya salió de la aplicación, que es el peor momento para enterarse.
 */
export function readFacebookConfigId(): FacebookConfigIdResult {
  // Algunos gestores de variables conservan las comillas del valor.
  const raw = (process.env[FACEBOOK_CONFIG_ID_ENV] || '').trim().replace(/^["']|["']$/g, '')
  if (!raw) return { ok: false, reason: 'missing' }
  // Los identificadores de configuración de Meta son numéricos y largos.
  if (!/^\d{10,25}$/.test(raw)) return { ok: false, reason: 'invalid' }
  return { ok: true, configId: raw }
}

export function getOAuthUrl(
  redirectUri: string,
  state: string,
  options: {
    includeInstagramMessaging?: boolean
    includeAds?: boolean
    configId?: string
  } = {}
): string {
  const scopes = [
    'pages_manage_metadata',
    'pages_show_list',
    'pages_messaging',
  ]

  if (options.includeInstagramMessaging) {
    scopes.push('instagram_basic', 'instagram_manage_messages')
  }

  // Ads and business permissions require separate approval in production.
  // Keep them out of the Facebook/Messenger connection flow unless that
  // dedicated combined flow explicitly requests them.
  if (options.includeAds) {
    scopes.push('business_management', 'pages_read_engagement', 'ads_read', 'ads_management')
  }

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  })

  // Facebook Login for Business requires its own configuration. Keep this
  // separate from the WhatsApp Embedded Signup configuration. A business
  // configuration owns the permissions, so `scope` must not be sent along
  // with `config_id` or Meta may reject the dialog before the callback.
  if (options.configId) {
    params.set('config_id', options.configId)
    params.set('override_default_response_type', 'true')
  } else {
    params.set('scope', scopes.join(','))
  }

  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirectUri,
    code,
  })
  return metaFetch(`${META_GRAPH_URL}/oauth/access_token?${params}`)
}

export async function getLongLivedToken(shortToken: string) {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  })
  return metaFetch(`${META_GRAPH_URL}/oauth/access_token?${params}`)
}

// -----------------------------------------------------------------------------
// Get Pages & Instagram accounts
// -----------------------------------------------------------------------------

export async function getUserPages(
  accessToken: string,
  options: { includeInstagram?: boolean } = {}
) {
  // El flujo exclusivo de Facebook no debe depender de campos de Instagram.
  // Solicitar instagram_business_account en /me/accounts puede hacer que Meta
  // omita o rechace páginas cuando el token sólo fue autorizado para
  // Facebook/Messenger. El flujo combinado sí necesita ese campo.
  const fields = options.includeInstagram
    ? 'id,name,access_token,instagram_business_account{id,username}'
    : 'id,name,access_token,tasks'
  const data = await metaFetch(
    `${META_GRAPH_URL}/me/accounts?fields=${encodeURIComponent(fields)}&access_token=${accessToken}`
  )
  return data.data || []
}

export async function getUserPermissions(accessToken: string) {
  const data = await metaFetch(
    `${META_GRAPH_URL}/me/permissions?access_token=${accessToken}`
  )
  return (data.data || []) as Array<{ permission: string; status: string }>
}

export async function getUserProfile(accessToken: string) {
  return metaFetch(`${META_GRAPH_URL}/me?fields=id,name,email&access_token=${accessToken}`)
}

export async function getUserAdAccounts(accessToken: string) {
  const data = await metaFetch(
    `${META_GRAPH_URL}/me/adaccounts?fields=id,account_id,name,business,account_status&access_token=${accessToken}`
  )
  return data.data || []
}

export async function subscribePageToApp(pageId: string, pageAccessToken: string) {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    subscribed_fields: [
      'messages',
      'messaging_postbacks',
      'message_deliveries',
      'message_reads',
    ].join(','),
  })

  return metaFetch(`${META_GRAPH_URL}/${pageId}/subscribed_apps?${params}`, {
    method: 'POST',
  })
}

export async function subscribeInstagramAccountToApp(
  instagramUserId: string,
  accessToken: string
) {
  const params = new URLSearchParams({
    access_token: accessToken,
    subscribed_fields: [
      'messages',
      'messaging_postbacks',
    ].join(','),
  })

  return metaFetch(`${INSTAGRAM_GRAPH_URL}/${instagramUserId}/subscribed_apps?${params}`, {
    method: 'POST',
  })
}

export async function getAdCampaigns(adAccountId: string, accessToken: string) {
  return metaFetch(
    `${META_GRAPH_URL}/act_${adAccountId}/campaigns?fields=id,name,status,objective,updated_time&access_token=${accessToken}`
  )
}

export async function getAdInsights(adAccountId: string, accessToken: string) {
  return metaFetch(
    `${META_GRAPH_URL}/act_${adAccountId}/insights?date_preset=last_7d&fields=spend,impressions,clicks,ctr,cpc&access_token=${accessToken}`
  )
}

export async function getPageInsights(pageId: string, pageToken: string) {
  return metaFetch(
    `${META_GRAPH_URL}/${pageId}/insights?metric=page_impressions,page_engaged_users,page_post_engagements&access_token=${pageToken}`
  )
}

// -----------------------------------------------------------------------------
// Facebook Publishing
// -----------------------------------------------------------------------------

export async function publishToFacebook(pageId: string, pageToken: string, options: {
  message: string
  imageUrl?: string
  link?: string
  scheduledTime?: number // Unix timestamp
}) {
  if (options.imageUrl) {
    const params: Record<string, string> = {
      url: options.imageUrl,
      message: options.message,
      access_token: pageToken,
    }
    if (options.scheduledTime) {
      params.published = 'false'
      params.scheduled_publish_time = String(options.scheduledTime)
    }
    return metaFetch(`${META_GRAPH_URL}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })
  }

  const params: Record<string, string> = {
    message: options.message,
    access_token: pageToken,
  }
  if (options.link) params.link = options.link
  if (options.scheduledTime) {
    params.published = 'false'
    params.scheduled_publish_time = String(options.scheduledTime)
  }

  return metaFetch(`${META_GRAPH_URL}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
}

// -----------------------------------------------------------------------------
// Instagram Publishing (2-step: create container → publish)
// -----------------------------------------------------------------------------

export async function publishToInstagram(igUserId: string, pageToken: string, options: {
  caption: string
  imageUrl?: string
  videoUrl?: string
  scheduledTime?: number
}) {
  // Step 1: Create media container
  const containerParams: Record<string, string> = {
    caption: options.caption,
    access_token: pageToken,
  }

  if (options.videoUrl) {
    containerParams.media_type = 'REELS'
    containerParams.video_url = options.videoUrl
  } else if (options.imageUrl) {
    containerParams.image_url = options.imageUrl
  } else {
    throw new Error('Se requiere imageUrl o videoUrl para publicar en Instagram')
  }

  const container = await metaFetch(`${META_GRAPH_URL}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(containerParams),
  })

  // Step 2: Wait for container to be ready (poll status for videos)
  if (options.videoUrl) {
    let ready = false
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const status = await metaFetch(
        `${META_GRAPH_URL}/${container.id}?fields=status_code&access_token=${pageToken}`
      )
      if (status.status_code === 'FINISHED') { ready = true; break }
      if (status.status_code === 'ERROR') throw new Error('Error procesando video en Instagram')
    }
    if (!ready) throw new Error('Timeout esperando procesamiento del video')
  }

  // Step 3: Publish container
  return metaFetch(`${META_GRAPH_URL}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: pageToken,
    }),
  })
}

// -----------------------------------------------------------------------------
// Messenger replies
// -----------------------------------------------------------------------------

export async function sendMetaTextMessage(
  accessToken: string,
  recipientId: string,
  text: string,
) {
  return metaFetch(`${META_GRAPH_URL}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: accessToken,
      messaging_type: 'RESPONSE',
      recipient: JSON.stringify({ id: recipientId }),
      message: JSON.stringify({ text }),
    }),
  })
}

export async function sendMetaAttachment(
  accessToken: string,
  recipientId: string,
  type: "image" | "video" | "audio" | "file",
  url: string
) {
  return metaFetch(`${META_GRAPH_URL}/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: accessToken,
      messaging_type: "RESPONSE",
      recipient: JSON.stringify({ id: recipientId }),
      message: JSON.stringify({
        attachment: {
          type,
          payload: { url },
        },
      }),
    }),
  });
}
