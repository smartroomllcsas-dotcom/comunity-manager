/**
 * Conexión de publicación y anuncios de una marca — SEPARADA de la del chat.
 *
 * El diálogo de Meta que usan las marcas para conectar Messenger e Instagram
 * lleva su propia lista de permisos. Meter ahí los de publicar o pautar es
 * arriesgado: si Meta no tiene uno aprobado, no falla ese permiso, falla el
 * diálogo entero y ninguna marca puede conectar el chat (pasó el 11 de
 * septiembre con pages_read_user_content). Por eso esto vive aparte: su propia
 * ruta, su propia lista y su propia tabla (`smarttalk.brand_ad_accounts`).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken } from "@/lib/auth/token-crypto";

/**
 * Permisos de SALIDA de contenido. Publicar y pautar van juntos porque son la
 * misma conversación con Meta; el chat es la de entrada y no se toca.
 * Todos están activos en la app (verificado el 15 y 16 de septiembre).
 */
export const ADS_SCOPES = [
  "public_profile",
  "pages_show_list",
  "business_management",
  // Anuncios
  "ads_management",
  "ads_read",
  // Publicar
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
] as const;

export type AdAccount = {
  id: string;
  account_id: string;
  name: string;
  account_status?: number;
  business_name?: string | null;
};

/**
 * Estado de la cuenta según Meta. Sólo la 1 sirve para trabajar; el resto se
 * muestra pero advertido, porque elegir una cerrada y descubrirlo tres días
 * después es peor que no poder elegirla.
 */
export const AD_ACCOUNT_STATUS: Record<number, string> = {
  1: "Activa",
  2: "Inhabilitada",
  3: "Sin método de pago",
  7: "En revisión",
  9: "En periodo de gracia",
  100: "Cerrada temporalmente",
  101: "Cerrada",
};

export function isUsableAccount(a: AdAccount): boolean {
  return a.account_status === 1;
}

/** Sólo lectura: sirve para informes, no para crear campañas. */
export function isReadOnly(a: AdAccount): boolean {
  return /\(read-only\)/i.test(a.name);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(read-only\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Palabras útiles del nombre, sin tildes ni "(Read-Only)" ni sufijos sueltos. */
function words(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(read-only\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

/**
 * Cuánto se parecen dos nombres, de 0 a 100. Se miran de dos formas porque los
 * nombres reales del portfolio fallan cada uno por su lado:
 *   - pegados: "Smart Digital Media 5.0" contra "SmartDigitalMedia", que sin
 *     espacios es la misma cadena pero no comparte ni una palabra;
 *   - por palabras: "Moda Style Cg" contra "cg moda", que comparte todas las
 *     palabras pero en otro orden, así que pegados no coinciden en nada.
 */
function similarity(brand: string, candidate: string): number {
  const a = normalize(brand);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;

  let pegados = 0;
  if (a.includes(b) || b.includes(a)) pegados = 80;

  const wa = words(brand);
  const wb = words(candidate);
  let porPalabras = 0;
  if (wa.length && wb.length) {
    const shared = wb.filter((w) => wa.includes(w)).length;
    if (shared > 0) porPalabras = Math.round((shared / Math.min(wa.length, wb.length)) * 80);
  }
  return Math.max(pegados, porPalabras);
}

/**
 * Con 25 cuentas en el portfolio, elegir "la primera que devuelve Meta" es
 * elegir mal. Esto propone la que más se parece al nombre de la marca, y la
 * propone nada más: la decisión sigue siendo de quien conecta.
 */
export function suggestAccountFor(brandName: string | null, accounts: AdAccount[]): string | null {
  if (!brandName || accounts.length === 0) return null;

  const scored = accounts
    .map((a) => {
      let score = similarity(brandName, a.name);
      // El negocio dueño de la cuenta ayuda, pero menos que su propio nombre.
      if (a.business_name) score = Math.max(score, Math.round(similarity(brandName, a.business_name) * 0.7));
      // Entre dos parecidas, gana la que se puede usar de verdad.
      if (score > 0 && isUsableAccount(a)) score += 5;
      if (score > 0 && !isReadOnly(a)) score += 3;
      return { id: a.account_id, score };
    })
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.id ?? null;
}

export type AdsConnection = {
  id: string;
  brand_id: string;
  /** Cuenta que proponemos cuando todavía no se ha elegido ninguna. */
  suggested_account_id?: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  business_id: string | null;
  available_accounts: AdAccount[];
  token_expires_at: string | null;
  scopes: string[];
  connected_at: string;
  last_error: string | null;
  connected: boolean;
};

type Row = Record<string, unknown> & { access_token_ciphertext?: string | null };

function shape(row: Row | null): AdsConnection | null {
  if (!row) return null;
  return {
    id: row.id as string,
    brand_id: row.brand_id as string,
    ad_account_id: (row.ad_account_id as string | null) ?? null,
    ad_account_name: (row.ad_account_name as string | null) ?? null,
    business_id: (row.business_id as string | null) ?? null,
    available_accounts: Array.isArray(row.available_accounts) ? (row.available_accounts as AdAccount[]) : [],
    token_expires_at: (row.token_expires_at as string | null) ?? null,
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    connected_at: row.connected_at as string,
    last_error: (row.last_error as string | null) ?? null,
    connected: Boolean(row.access_token_ciphertext),
  };
}

/** Estado de la conexión, sin el token: esto viaja al navegador. */
export async function getAdsConnection(brandId: string): Promise<AdsConnection | null> {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin.from("brand_ad_accounts").select("*").eq("brand_id", brandId).maybeSingle();
  return shape(data as Row | null);
}

/** Token descifrado, sólo para uso en el servidor. */
export async function getAdsAccessToken(brandId: string): Promise<string | null> {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("brand_ad_accounts")
    .select("access_token_ciphertext")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!data) return null;
  return resolveToken((data as Row).access_token_ciphertext, null);
}

export async function saveAdsConnection(input: {
  organizationId: string;
  brandId: string;
  tokenCiphertext: string;
  expiresAt: string | null;
  accounts: AdAccount[];
  connectedBy?: string | null;
}): Promise<{ ok: true; connection: AdsConnection } | { ok: false; error: string }> {
  const admin = createAdminClient("smarttalk");
  const previous = await getAdsConnection(input.brandId);

  // Al reconectar se respeta la cuenta ya elegida si sigue disponible: nadie
  // quiere volver a elegir en cada reconexión.
  //
  // Si no hay elección previa, sólo se elige sola cuando hay UNA cuenta. Con
  // varias se deja sin elegir a propósito y la tarjeta la pide: en un portfolio
  // de agencia hay decenas de cuentas y "la primera que devuelve Meta" es casi
  // siempre la equivocada — la primera prueba conectó Smart Digital Media a la
  // cuenta de SMART Sends.
  const keep = previous?.ad_account_id
    ? input.accounts.find((a) => a.account_id === previous.ad_account_id)
    : undefined;
  const chosen = keep || (input.accounts.length === 1 ? input.accounts[0] : null);

  const { data, error } = await admin
    .from("brand_ad_accounts")
    .upsert(
      {
        organization_id: input.organizationId,
        brand_id: input.brandId,
        ad_account_id: chosen?.account_id ?? null,
        ad_account_name: chosen?.name ?? null,
        business_id: chosen?.business_name ?? null,
        available_accounts: input.accounts,
        access_token_ciphertext: input.tokenCiphertext,
        token_expires_at: input.expiresAt,
        scopes: [...ADS_SCOPES],
        connected_by: input.connectedBy ?? null,
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id" }
    )
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, connection: shape(data as Row)! };
}

/** Cambiar la cuenta publicitaria elegida, sin repetir el diálogo de Meta. */
export async function selectAdAccount(
  brandId: string,
  adAccountId: string
): Promise<{ ok: true; connection: AdsConnection } | { ok: false; error: string }> {
  const current = await getAdsConnection(brandId);
  if (!current) return { ok: false, error: "Esta empresa no tiene la conexión de anuncios" };
  const account = current.available_accounts.find((a) => a.account_id === adAccountId);
  if (!account) return { ok: false, error: "Esa cuenta publicitaria no está entre las de esta conexión" };

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("brand_ad_accounts")
    .update({
      ad_account_id: account.account_id,
      ad_account_name: account.name,
      updated_at: new Date().toISOString(),
    })
    .eq("brand_id", brandId)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, connection: shape(data as Row)! };
}

export async function disconnectAds(brandId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient("smarttalk");
  const { error } = await admin.from("brand_ad_accounts").delete().eq("brand_id", brandId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
