// =============================================================================
// Meta Graph API - OAuth & Content Publishing (Instagram + Facebook)
// =============================================================================

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0'

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

export function getOAuthUrl(redirectUri: string, state: string): string {
  const scopes = [
    'pages_manage_posts',
    'pages_read_engagement',
    'pages_show_list',
    'instagram_basic',
    'instagram_content_publish',
  ].join(',')

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    response_type: 'code',
  })

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

export async function getUserPages(accessToken: string) {
  const data = await metaFetch(
    `${META_GRAPH_URL}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${accessToken}`
  )
  return data.data || []
}

export async function getUserProfile(accessToken: string) {
  return metaFetch(`${META_GRAPH_URL}/me?fields=id,name,email&access_token=${accessToken}`)
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

  const container = await metaFetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
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
        `https://graph.instagram.com/v21.0/${container.id}?fields=status_code&access_token=${pageToken}`
      )
      if (status.status_code === 'FINISHED') { ready = true; break }
      if (status.status_code === 'ERROR') throw new Error('Error procesando video en Instagram')
    }
    if (!ready) throw new Error('Timeout esperando procesamiento del video')
  }

  // Step 3: Publish container
  return metaFetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: pageToken,
    }),
  })
}
