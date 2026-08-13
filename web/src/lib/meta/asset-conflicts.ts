/**
 * Un activo de Meta pertenece a **una sola marca**.
 *
 * El problema
 * -----------
 * Una página de Facebook, una cuenta de Instagram Business o un número de
 * WhatsApp son recursos únicos en Meta: los webhooks llegan por el activo, no
 * por la marca. Si el mismo activo queda conectado a dos marcas de la misma
 * organización, los mensajes entrantes se enrutan a una de ellas de forma
 * arbitraria —`findMatchingChannel` incluso rechaza el evento por ambigüedad— y
 * los envíos salen con credenciales que pueden no ser las esperadas.
 *
 * Qué hace este módulo
 * --------------------
 * Antes de guardar, comprueba si el activo ya está en **otra marca activa** de
 * la misma organización. Tres matices deliberados:
 *
 *   1. **Reconectar dentro de la misma marca está permitido.** Es el caso
 *      normal de renovar un token caducado.
 *   2. **Una marca pausada no bloquea.** Desactivar una marca libera sus
 *      activos igual que libera su cupo (véase §94); exigir reactivarla sólo
 *      para poder soltar la página sería absurdo.
 *   3. **Nunca se mueve nada automáticamente.** Se bloquea y se dice dónde
 *      está. Mover un activo sin que nadie lo pida rompería la marca de origen
 *      en silencio.
 *
 * El aislamiento entre agencias es previo: todas las consultas filtran por
 * `organization_id`, así que una página conectada en otra organización no
 * bloquea aquí ni se menciona.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { BRAND_STATUS_PAUSED } from "@/lib/smarttalk/brand-status";

export type MetaAssetKind = "facebook_page" | "instagram_account" | "whatsapp_phone";

export interface AssetConflict {
  kind: MetaAssetKind;
  assetId: string;
  /** Marca que ya tiene el activo. */
  brandId: string;
  brandName: string | null;
  message: string;
}

const ASSET_LABEL: Record<MetaAssetKind, string> = {
  facebook_page: "Esta página de Facebook",
  instagram_account: "Esta cuenta de Instagram",
  whatsapp_phone: "Este número de WhatsApp",
};

/**
 * Mensaje único, literal y acordado con negocio.
 *
 * Vive aquí para que los tres flujos digan exactamente lo mismo: un texto que
 * cambie según la ruta haría dudar de si son el mismo problema.
 */
export function conflictMessage(brandName: string | null): string {
  return `Este canal ya está conectado a la marca ${brandName || "otra marca"}. Desconéctalo allí antes de asignarlo a otra marca.`;
}

async function brandsById(organizationId: string, brandIds: string[]) {
  const unique = [...new Set(brandIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, { id: string; name: string | null; status: string | null }>();

  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from("cm_clients")
    .select("id, name, status")
    .eq("smarttalk_organization_id", organizationId)
    .in("id", unique);

  // Sin esta comprobación, un error de lectura devolvía un mapa vacío, el bucle
  // de `findAssetConflict` no encontraba ninguna marca conocida y la conclusión
  // era «no hay conflicto»: exactamente el veredicto contrario al seguro.
  if (error) throw new Error(`cm_clients: ${error.message}`);

  return new Map(
    ((data || []) as { id: string; name: string | null; status: string | null }[]).map((row) => [
      row.id,
      row,
    ]),
  );
}

interface Holder {
  brandId: string;
}

/** Marcas —distintas de la propia— que ya tienen este activo. */
async function findHolders(input: {
  kind: MetaAssetKind;
  assetId: string;
  organizationId: string;
  brandId: string;
}): Promise<Holder[]> {
  const { kind, assetId, organizationId, brandId } = input;
  const holders: Holder[] = [];

  // 1. Canales de SmartTalk: la fuente operativa, la que usan los webhooks.
  const smarttalkAdmin = createAdminClient("smarttalk");
  const channelColumn =
    kind === "whatsapp_phone" ? "whatsapp_phone_number_id" : "meta_business_id";

  const { data: channels, error: channelsError } = await smarttalkAdmin
    .from("channels")
    .select("id, brand_id, status")
    .eq("organization_id", organizationId)
    .eq(channelColumn, assetId)
    .neq("brand_id", brandId);

  if (channelsError) throw new Error(`channels: ${channelsError.message}`);

  for (const channel of (channels || []) as { brand_id: string; status: string }[]) {
    // Un canal desconectado no reclama el activo.
    if (channel.status === "disconnected") continue;
    holders.push({ brandId: channel.brand_id });
  }

  // 2. Cuentas sociales legacy: siguen alimentando la interfaz de /clients.
  if (kind !== "whatsapp_phone") {
    const publicAdmin = createAdminClient("public");
    const column = kind === "facebook_page" ? "page_id" : "instagram_id";
    const { data: socials, error: socialsError } = await publicAdmin
      .from("cm_social_accounts")
      .select("client_id")
      .eq(column, assetId)
      .neq("client_id", brandId);
    if (socialsError) throw new Error(`cm_social_accounts: ${socialsError.message}`);
    for (const social of (socials || []) as { client_id: string }[]) {
      holders.push({ brandId: social.client_id });
    }
  } else {
    const publicAdmin = createAdminClient("public");
    const { data: waAccounts, error: waError } = await publicAdmin
      .from("cm_whatsapp_accounts")
      .select("client_id")
      .eq("phone_number_id", assetId)
      .neq("client_id", brandId);
    if (waError) throw new Error(`cm_whatsapp_accounts: ${waError.message}`);
    for (const account of (waAccounts || []) as { client_id: string }[]) {
      if (account.client_id) holders.push({ brandId: account.client_id });
    }
  }

  return holders;
}

/**
 * ¿Puede esta marca quedarse con este activo?
 *
 * Devuelve `null` cuando no hay conflicto. Nunca lanza: quien llama está en
 * mitad de un callback de OAuth y necesita poder redirigir con un mensaje.
 */
export async function findAssetConflict(input: {
  kind: MetaAssetKind;
  assetId: string | null | undefined;
  organizationId: string;
  brandId: string;
}): Promise<AssetConflict | null> {
  const { kind, organizationId, brandId } = input;
  const assetId = (input.assetId || "").trim();
  if (!assetId || !organizationId || !brandId) return null;

  try {
    const holders = await findHolders({ kind, assetId, organizationId, brandId });
    if (holders.length === 0) return null;

    // Sólo las marcas que existen en ESTA organización cuentan: una fila legacy
    // de otra agencia no debe bloquear ni, mucho menos, revelar su nombre.
    const brands = await brandsById(
      organizationId,
      holders.map((holder) => holder.brandId),
    );

    for (const holder of holders) {
      const brand = brands.get(holder.brandId);
      if (!brand) continue;
      // Una marca pausada no retiene sus activos.
      if (brand.status === BRAND_STATUS_PAUSED) continue;

      return {
        kind,
        assetId,
        brandId: brand.id,
        brandName: brand.name,
        message: conflictMessage(brand.name),
      };
    }

    return null;
  } catch (error) {
    // Un fallo de lectura no debe permitir la escritura: si no se puede
    // comprobar, no se conecta.
    //
    // Esto sólo es cierto porque **todas** las consultas de arriba lanzan ante
    // `error`. Supabase devuelve los errores en el resultado en vez de lanzar,
    // así que ignorarlos convertía un fallo de base en un «no hay conflicto»
    // que dejaba pasar la escritura.
    console.error(
      `[meta-assets] no se pudo verificar el conflicto de ${kind}: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    );
    return {
      kind,
      assetId,
      brandId: "",
      brandName: null,
      message:
        "No se pudo verificar si este canal ya está conectado a otra marca. Inténtalo de nuevo.",
    };
  }
}

/** Etiqueta legible del activo, para mensajes que no usan el literal acordado. */
export function assetLabel(kind: MetaAssetKind) {
  return ASSET_LABEL[kind];
}
