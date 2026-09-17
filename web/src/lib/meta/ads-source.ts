/**
 * De dónde salen la cuenta publicitaria y el token para leer campañas.
 *
 * Primero la conexión nueva por empresa (`brand_ad_accounts`, el botón
 * "Conectar publicación y anuncios"). Si esa marca todavía no la tiene, se cae
 * a la tabla vieja `cm_social_accounts`, que era donde vivía esto antes.
 *
 * Devuelve también el motivo cuando no hay nada, para que la pantalla pueda
 * decir qué falta en vez de enseñar números inventados.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken } from "@/lib/auth/token-crypto";
import { getAdsConnection, getAdsAccessToken } from "@/lib/meta/ads-connection";

export type AdsSource =
  | { ok: true; adAccountId: string; token: string; origin: "conexion" | "legado" }
  | { ok: false; reason: string; needsConnect: boolean };

export async function resolveAdsSource(brandId: string): Promise<AdsSource> {
  const connection = await getAdsConnection(brandId);
  if (connection?.connected) {
    if (!connection.ad_account_id) {
      return {
        ok: false,
        needsConnect: false,
        reason:
          "Falta elegir la cuenta publicitaria de esta empresa. Hazlo en Clientes, en la tarjeta de la empresa.",
      };
    }
    const token = await getAdsAccessToken(brandId);
    if (token) {
      return { ok: true, adAccountId: connection.ad_account_id, token, origin: "conexion" };
    }
  }

  // Camino viejo: la conexión de canales guardaba aquí la cuenta publicitaria.
  try {
    const pub = createAdminClient("public");
    const { data } = await pub
      .from("cm_social_accounts")
      .select("ad_account_id, access_token, access_token_ciphertext")
      .eq("client_id", brandId)
      .maybeSingle();
    const legacyToken = data
      ? resolveToken(
          (data as Record<string, unknown>).access_token_ciphertext as string | null,
          (data as Record<string, unknown>).access_token as string | null
        )
      : null;
    const legacyAccount = (data as Record<string, unknown> | null)?.ad_account_id as string | null;
    if (legacyAccount && legacyToken) {
      return { ok: true, adAccountId: legacyAccount, token: legacyToken, origin: "legado" };
    }
  } catch {
    /* se responde abajo */
  }

  return {
    ok: false,
    needsConnect: true,
    reason:
      "Esta empresa todavía no tiene conectada la publicación y los anuncios. Conéctala en Clientes, en su tarjeta.",
  };
}
