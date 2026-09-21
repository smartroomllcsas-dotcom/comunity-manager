// =============================================================================
// Meta Graph API - OAuth & Content Publishing (Instagram + Facebook)
// =============================================================================

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`
const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com'

// Transient error codes that should be retried
const TRANSIENT_ERROR_CODES = [1, 2, 4, 17]
const TOKEN_EXPIRED_SUBCODES = [463, 467]

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
    // OAuth code 190 significa token inválido en general; también aparece si
    // se envía un token de Facebook al host de Instagram. Sólo los subcódigos
    // 463/467 demuestran expiración real.
    isTokenExpired: TOKEN_EXPIRED_SUBCODES.includes(error.error_subcode),
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
    includeWhatsAppCloud?: boolean
    configId?: string
  } = {}
): string {
  const scopes = [
    'pages_manage_metadata',
    'pages_show_list',
    'pages_messaging',
    // Lead Ads: leer los envíos de formularios (Centro de clientes potenciales).
    // pages_manage_ads es requisito de Meta para listar /leadgen_forms.
    'leads_retrieval',
    'pages_manage_ads',
    'pages_read_engagement',
    // Comentarios: responder públicamente un comentario de la página exige
    // pages_manage_engagement. Igual que pages_manage_posts, Meta lo concede
    // sólo si el caso de uso de la app lo incluye (revisión de la aplicación).
    // Si el diálogo de conexión empieza a fallar con "Invalid Scopes:
    // pages_manage_engagement", quítalo hasta que Meta lo apruebe.
    'pages_manage_engagement',
    // NOTA (2026-08-29): 'pages_manage_posts' NO puede pedirse todavía — en
    // esta app requiere App Review ("Agregar a revisión" en el caso de uso
    // Administrar páginas). Incluirlo rompe el diálogo OAuth completo con
    // "Invalid Scopes: pages_manage_posts" (regresión del Bug 3 fix del
    // 2026-08-25). Reincorporarlo aquí SOLO cuando Meta apruebe el permiso.
  ]

  if (options.includeInstagramMessaging) {
    scopes.push(
      'instagram_basic',
      'instagram_manage_messages',
      // Responder comentarios de Instagram.
      'instagram_manage_comments',
      // Bug 3 fix: publicar en IG requiere content_publish explicito.
      'instagram_content_publish',
    )
  }

  // Ads and business permissions require separate approval in production.
  // Keep them out of the Facebook/Messenger connection flow unless that
  // dedicated combined flow explicitly requests them.
  if (options.includeAds) {
    scopes.push('business_management', 'pages_read_engagement', 'ads_read', 'ads_management')
  }

  // WhatsApp Business Platform (Cloud API oficial) — templates + envio.
  // Solo cuando el flujo de connect lo pida explicito (Embedded Signup),
  // no meter en el flow FB/IG estandar para no ampliar el consent.
  if (options.includeWhatsAppCloud) {
    scopes.push('whatsapp_business_management', 'whatsapp_business_messaging')
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
      'leadgen',
      // Comentarios de publicaciones y pautas de la página.
      'feed',
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
      // Comentarios en publicaciones y pautas de Instagram.
      'comments',
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

/**
 * Periodos que acepta Meta tal cual. `maximum` es todo el historial de la
 * cuenta; los demás se explican solos.
 */
export const AD_DATE_PRESETS = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_90d',
  'this_month',
  'last_month',
  'maximum',
] as const
export type AdDatePreset = (typeof AD_DATE_PRESETS)[number]

export type AdInsightsRange =
  | { preset: AdDatePreset }
  /** Fechas propias, en YYYY-MM-DD. Meta las trata como inclusivas. */
  | { since: string; until: string }

export async function getAdInsights(
  adAccountId: string,
  accessToken: string,
  range: AdInsightsRange = { preset: 'last_7d' },
  /**
   * Por defecto devuelve una sola fila con el total de la cuenta. Con
   * `level: 'ad'` devuelve una fila por anuncio, que es lo que hace falta para
   * comparar anuncios entre sí.
   */
  options: { level?: 'account' | 'campaign' | 'adset' | 'ad'; extraFields?: string[] } = {},
) {
  const fields = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'reach', 'frequency', ...(options.extraFields || [])]
  const params = new URLSearchParams({
    fields: fields.join(','),
    access_token: accessToken,
  })
  if (options.level && options.level !== 'account') {
    params.set('level', options.level)
    // Una cuenta con muchos anuncios pagina; 500 cubre de sobra un periodo.
    params.set('limit', '500')
  }
  if ('preset' in range) params.set('date_preset', range.preset)
  else params.set('time_range', JSON.stringify({ since: range.since, until: range.until }))

  return metaFetch(`${META_GRAPH_URL}/act_${adAccountId}/insights?${params}`)
}

type MetaInsightLevel = 'campaign' | 'adset' | 'ad'

/**
 * Obtiene el detalle de una campaña sin exponer el token al navegador.
 *
 * La lista de campañas es deliberadamente liviana. Este método se llama sólo
 * cuando la persona pulsa «Ver más» y resuelve la jerarquía campaña → conjunto
 * de anuncios → anuncio/creativo, además de las métricas del mismo periodo.
 */
export async function getAdCampaignDetails(
  campaignId: string,
  accessToken: string,
  range: AdInsightsRange = { preset: 'last_30d' },
) {
  const campaignFields = [
    'id',
    'account_id',
    'name',
    'status',
    'effective_status',
    'configured_status',
    'objective',
    'buying_type',
    'special_ad_categories',
    'daily_budget',
    'lifetime_budget',
    'start_time',
    'stop_time',
    'created_time',
    'updated_time',
  ].join(',')
  const adSetFields = [
    'id',
    'name',
    'status',
    'effective_status',
    'configured_status',
    'targeting',
    'daily_budget',
    'lifetime_budget',
    'start_time',
    'end_time',
  ].join(',')
  const adFields = [
    'id',
    'name',
    'status',
    'effective_status',
    'configured_status',
        // OJO: `preview_shareable_link` NO existe en la API de anuncios (v21).
    // Pedirlo hacía fallar la consulta entera con el error 100 y el detalle
    // no abría nunca. Para enlazar a la publicación se usa
    // `effective_object_story_id`, que sí existe.
    'creative{id,name,object_story_spec,asset_feed_spec,thumbnail_url,image_url,video_id,object_type,effective_object_story_id}',
  ].join(',')

  const campaignUrl = `${META_GRAPH_URL}/${encodeURIComponent(campaignId)}?${new URLSearchParams({
    fields: campaignFields,
    access_token: accessToken,
  })}`
  const adSetsUrl = `${META_GRAPH_URL}/${encodeURIComponent(campaignId)}/adsets?${new URLSearchParams({
    fields: adSetFields,
    limit: '100',
    access_token: accessToken,
  })}`

  const [campaign, adSets, campaignInsights, adSetInsights, adInsights] = await Promise.all([
    metaFetch(campaignUrl),
    metaFetch(adSetsUrl),
    getMetaObjectInsights(campaignId, accessToken, range, 'campaign'),
    getMetaObjectInsights(campaignId, accessToken, range, 'adset'),
    getMetaObjectInsights(campaignId, accessToken, range, 'ad'),
  ])

  // Los anuncios se piden de la campaña entera en UNA llamada y se agrupan
  // aquí. Pedirlos por conjunto era una llamada por conjunto: con la app en
  // acceso limitado (60 puntos, cada lectura cuenta 1) una campaña de veinte
  // conjuntos gastaba el cupo de golpe y Meta bloqueaba cinco minutos.
  const adSetRows = Array.isArray(adSets?.data) ? adSets.data : []
  const allAds = await metaFetch(
    `${META_GRAPH_URL}/${encodeURIComponent(campaignId)}/ads?${new URLSearchParams({
      fields: `adset_id,${adFields}`,
      limit: '250',
      access_token: accessToken,
    })}`,
  )
  const adsByAdSet = new Map<string, Array<Record<string, unknown>>>()
  for (const ad of Array.isArray(allAds?.data) ? allAds.data : []) {
    const key = String((ad as Record<string, unknown>).adset_id ?? '')
    if (!key) continue
    const list = adsByAdSet.get(key)
    if (list) list.push(ad as Record<string, unknown>)
    else adsByAdSet.set(key, [ad as Record<string, unknown>])
  }
  const adSetDetails = adSetRows.map((adSet: Record<string, unknown>) => ({
    ...adSet,
    ads: adsByAdSet.get(String(adSet.id)) ?? [],
  }))

  return {
    campaign,
    adsets: adSetDetails,
    insights: {
      campaign: Array.isArray(campaignInsights?.data) ? campaignInsights.data[0] ?? null : null,
      adsets: Array.isArray(adSetInsights?.data) ? adSetInsights.data : [],
      ads: Array.isArray(adInsights?.data) ? adInsights.data : [],
    },
  }
}

async function getMetaObjectInsights(
  objectId: string,
  accessToken: string,
  range: AdInsightsRange,
  level: MetaInsightLevel,
) {
  const params = new URLSearchParams({
    fields: 'spend,impressions,reach,clicks,ctr,cpc,frequency,actions,date_start,date_stop,ad_id,adset_id,ad_name,adset_name',
    level,
    access_token: accessToken,
  })
  if ('preset' in range) params.set('date_preset', range.preset)
  else params.set('time_range', JSON.stringify({ since: range.since, until: range.until }))
  return metaFetch(`${META_GRAPH_URL}/${encodeURIComponent(objectId)}/insights?${params}`)
}

export async function getPageInsights(
  pageId: string,
  pageToken: string,
  range: AdInsightsRange = { preset: 'last_7d' },
) {
  const params = new URLSearchParams({
    metric: 'page_impressions,page_engaged_users,page_post_engagements',
    access_token: pageToken,
  })
  // La API de la página no entiende date_preset: siempre quiere fechas.
  const { since, until } = 'preset' in range ? presetToDates(range.preset) : range
  params.set('since', since)
  params.set('until', until)
  params.set('period', 'day')

  return metaFetch(`${META_GRAPH_URL}/${pageId}/insights?${params}`)
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Traduce un periodo de Meta a fechas, para las APIs que no aceptan presets. */
export function presetToDates(preset: AdDatePreset): { since: string; until: string } {
  const now = new Date()
  const start = new Date(now)
  switch (preset) {
    case 'today':
      break
    case 'yesterday':
      start.setDate(now.getDate() - 1)
      now.setDate(now.getDate() - 1)
      break
    case 'last_14d':
      start.setDate(now.getDate() - 14)
      break
    case 'last_30d':
      start.setDate(now.getDate() - 30)
      break
    case 'last_90d':
      start.setDate(now.getDate() - 90)
      break
    case 'this_month':
      start.setDate(1)
      break
    case 'last_month': {
      start.setMonth(now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { since: ymd(start), until: ymd(end) }
    }
    case 'maximum':
      // La API de páginas no da más de dos años hacia atrás.
      start.setFullYear(now.getFullYear() - 2)
      break
    case 'last_7d':
    default:
      start.setDate(now.getDate() - 7)
  }
  return { since: ymd(start), until: ymd(now) }
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

/**
 * Messenger/Instagram sólo permiten responder dentro de las 24 h siguientes
 * al último mensaje del cliente. Con la etiqueta HUMAN_AGENT (permiso
 * `human_agent` de la app) la ventana se extiende a 7 días.
 */
export function isMetaMessagingWindowError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /outside of allowed window|\(code: (10|2018)\)|#2018|\(#10\)/i.test(message)
}

export async function sendMetaTextMessage(
  accessToken: string,
  recipientId: string,
  text: string,
  options: { tag?: 'HUMAN_AGENT' } = {},
) {
  const params: Record<string, string> = {
    access_token: accessToken,
    recipient: JSON.stringify({ id: recipientId }),
    message: JSON.stringify({ text }),
  }
  if (options.tag) {
    params.messaging_type = 'MESSAGE_TAG'
    params.tag = options.tag
  } else {
    params.messaging_type = 'RESPONSE'
  }
  return metaFetch(`${META_GRAPH_URL}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
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

/**
 * Responder EN PÚBLICO un comentario.
 * Facebook: POST /{comment-id}/comments · Instagram: POST /{comment-id}/replies
 */
export async function replyToComment(
  accessToken: string,
  platform: 'facebook' | 'instagram',
  commentId: string,
  message: string,
): Promise<{ id?: string }> {
  const path = platform === 'instagram' ? 'replies' : 'comments'
  const params = new URLSearchParams({ access_token: accessToken, message })
  return metaFetch(`${META_GRAPH_URL}/${encodeURIComponent(commentId)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
}

/**
 * Mensaje AL INTERNO a quien comentó (private reply de Meta): se envía al
 * comment_id, no a un usuario. Meta lo permite UNA sola vez por comentario y
 * dentro de los 7 días siguientes. La respuesta trae el id del destinatario,
 * con el que se abre la conversación en el Inbox.
 *
 * Vale para Facebook y para Instagram, y en los dos el destino es `me` — la
 * página, resuelta por el token. Instagram tiene un endpoint propio
 * `/{ig-user-id}/messages`, pero ese pertenece a la API de Instagram con inicio
 * de sesión de Instagram; llamarlo con el token de la página devuelve
 * "(#3) Application does not have the capability to make this API call".
 * Los mensajes normales de Instagram salen por `/me/messages` desde el
 * principio (ver sendMetaTextMessage): el privado a un comentario va por el
 * mismo sitio.
 */
export async function sendPrivateReplyToComment(
  accessToken: string,
  commentId: string,
  text: string,
): Promise<{ recipient_id?: string; message_id?: string }> {
  const params = new URLSearchParams({
    access_token: accessToken,
    recipient: JSON.stringify({ comment_id: commentId }),
    message: JSON.stringify({ text }),
  })
  return metaFetch(`${META_GRAPH_URL}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
}

/** Enlace permanente del comentario o de su publicación (para abrirlo en Meta). */
export async function getCommentPermalink(
  accessToken: string,
  commentId: string,
): Promise<string | null> {
  try {
    const data = await metaFetch(
      `${META_GRAPH_URL}/${encodeURIComponent(commentId)}?fields=permalink_url&access_token=${accessToken}`,
    )
    return (data?.permalink_url as string | undefined) || null
  } catch {
    return null
  }
}

/**
 * Pausar o reactivar una campaña, un conjunto o un anuncio.
 *
 * Es la única escritura que la plataforma hace sobre la pauta, y es
 * deliberadamente la más reversible que existe: cambia un estado, no crea nada
 * ni mueve presupuesto. Meta responde `{ success: true }`.
 *
 * ACTIVE no garantiza que empiece a correr: si la cuenta no tiene método de
 * pago o el conjunto padre está en pausa, Meta acepta el cambio y el estado
 * efectivo sigue detenido. Por eso quien llama debe leer `effective_status`
 * después, no fiarse del `success`.
 */
export async function updateAdObjectStatus(
  objectId: string,
  accessToken: string,
  status: 'ACTIVE' | 'PAUSED',
): Promise<{ success?: boolean }> {
  return metaFetch(`${META_GRAPH_URL}/${encodeURIComponent(objectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status, access_token: accessToken }),
  })
}
