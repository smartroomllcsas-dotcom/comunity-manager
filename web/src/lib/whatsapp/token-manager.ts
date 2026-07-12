import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, resolveToken } from "@/lib/auth/token-crypto";

const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

/**
 * Exchange a short-lived token for a long-lived token (60 days)
 * Called right after Embedded Signup OAuth flow
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
}> {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Facebook App credentials not configured");
  }

  const response = await fetch(
    `${GRAPH_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Subscribe a WABA to the app to receive webhooks
 * Must be called after connecting a new WhatsApp channel
 */
export async function subscribeWABAToApp(wabaId: string, accessToken: string): Promise<void> {
  const response = await fetch(
    `${GRAPH_URL}/${wabaId}/subscribed_apps`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`WABA subscription failed: ${JSON.stringify(error)}`);
  }
}

/**
 * Register a phone number for WhatsApp messaging
 * Required before a phone number can send/receive messages
 */
export async function registerPhoneNumber(phoneNumberId: string, accessToken: string): Promise<void> {
  const response = await fetch(
    `${GRAPH_URL}/${phoneNumberId}/register`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin: "000000" // 6-digit PIN for two-step verification
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    // Don't throw if already registered
    if (!JSON.stringify(error).includes("already registered")) {
      throw new Error(`Phone registration failed: ${JSON.stringify(error)}`);
    }
  }
}

/**
 * Get phone numbers for a WABA
 */
export async function getWABAPhoneNumbers(wabaId: string, accessToken: string): Promise<Array<{
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
}>> {
  const response = await fetch(
    `${GRAPH_URL}/${wabaId}/phone_numbers`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error("Failed to get phone numbers");
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Refresh tokens for all channels expiring within 7 days
 * Called by the cron job endpoint
 */
export async function refreshExpiringTokens(): Promise<{
  refreshed: number;
  failed: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  // Find channels with tokens expiring in the next 7 days.
  // OR() cubre canales cifrados y legacy plano — cualquiera de los dos indica que hay token.
  const { data: channels } = await admin
    .from("channels")
    .select("id, access_token, access_token_ciphertext, organization_id, name")
    .eq("status", "active")
    .or("access_token.not.is.null,access_token_ciphertext.not.is.null")
    .not("token_expires_at", "is", null)
    .lt("token_expires_at", sevenDaysFromNow.toISOString());

  if (!channels || channels.length === 0) {
    return { refreshed: 0, failed: 0, errors: [] };
  }

  let refreshed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const channel of channels) {
    try {
      const currentToken = resolveToken(channel.access_token_ciphertext, channel.access_token);
      if (!currentToken) {
        throw new Error("token no legible");
      }
      const result = await exchangeForLongLivedToken(currentToken);

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + result.expires_in);

      await admin
        .from("channels")
        .update({
          access_token: null,
          access_token_ciphertext: encryptToken(result.access_token),
          token_expires_at: expiresAt.toISOString(),
        })
        .eq("id", channel.id);

      refreshed++;
    } catch (error) {
      failed++;
      errors.push(`Channel ${channel.id} (${channel.name}): ${error instanceof Error ? error.message : "Unknown error"}`);

      // If token refresh fails, mark channel with error
      await admin
        .from("channels")
        .update({ status: "error" as const })
        .eq("id", channel.id);
    }
  }

  return { refreshed, failed, errors };
}
