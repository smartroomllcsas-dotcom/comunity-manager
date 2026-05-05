// WhatsApp Embedded Signup token exchange and Graph API helpers.
// The "code" returned by FB.login(response_type='code') is exchanged for a
// system user access token via Graph API. No redirect_uri is required for
// Embedded Signup — the code-for-token exchange is server-to-server.

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0'

export interface WhatsAppTokenResponse {
  access_token: string
  token_type: string
}

export interface WhatsAppPhoneNumber {
  id: string
  display_phone_number?: string
  verified_name?: string
}

export async function exchangeWhatsAppCode(code: string): Promise<WhatsAppTokenResponse> {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    throw new Error('META_APP_ID o META_APP_SECRET no configurados')
  }

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    code,
  })

  const res = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params}`)
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(`WhatsApp OAuth: ${data.error?.message || 'Error desconocido'}`)
  }
  return data as WhatsAppTokenResponse
}

export async function getPhoneNumberDetails(
  phoneNumberId: string,
  accessToken: string
): Promise<WhatsAppPhoneNumber> {
  const fields = 'display_phone_number,verified_name'
  const res = await fetch(
    `${META_GRAPH_URL}/${phoneNumberId}?fields=${fields}&access_token=${accessToken}`
  )
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(`WA phone details: ${data.error?.message || 'Error desconocido'}`)
  }
  return { id: phoneNumberId, ...data }
}
