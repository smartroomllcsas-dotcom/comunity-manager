// Instagram Business Login — separate from Facebook Graph OAuth
// API base differs: token exchange happens at api.instagram.com,
// long-lived tokens and Graph calls at graph.instagram.com.

const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const IG_GRAPH_URL = 'https://graph.instagram.com'

export interface InstagramShortToken {
  access_token: string
  user_id: string | number
  permissions?: string[]
}

export interface InstagramLongToken {
  access_token: string
  token_type: string
  expires_in: number
}

export interface InstagramProfile {
  id: string
  username: string
  account_type?: string
  name?: string
  profile_picture_url?: string
  followers_count?: number
  media_count?: number
}

export async function exchangeInstagramCode(
  code: string,
  redirectUri: string
): Promise<InstagramShortToken> {
  if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET) {
    throw new Error('INSTAGRAM_APP_ID o INSTAGRAM_APP_SECRET no configurados')
  }

  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  })

  const res = await fetch(IG_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await res.json()
  if (!res.ok || data.error_type || data.error) {
    const msg = data.error_message || data.error?.message || 'Error intercambiando code'
    throw new Error(`Instagram OAuth: ${msg}`)
  }
  return data as InstagramShortToken
}

export async function getInstagramLongLivedToken(shortToken: string): Promise<InstagramLongToken> {
  if (!process.env.INSTAGRAM_APP_SECRET) {
    throw new Error('INSTAGRAM_APP_SECRET no configurado')
  }
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    access_token: shortToken,
  })
  const res = await fetch(`${IG_GRAPH_URL}/access_token?${params}`)
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(`Instagram long-lived token: ${data.error?.message || 'Error desconocido'}`)
  }
  return data as InstagramLongToken
}

export async function getInstagramProfile(accessToken: string): Promise<InstagramProfile> {
  const fields = 'id,username,account_type,name,profile_picture_url,followers_count,media_count'
  const res = await fetch(`${IG_GRAPH_URL}/me?fields=${fields}&access_token=${accessToken}`)
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(`Instagram profile: ${data.error?.message || 'Error desconocido'}`)
  }
  return data as InstagramProfile
}
