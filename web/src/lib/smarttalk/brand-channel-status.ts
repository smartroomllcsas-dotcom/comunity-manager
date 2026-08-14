/**
 * ¿Está este canal de la marca realmente conectado?
 *
 * El problema
 * -----------
 * La pantalla de marcas decidía «conectado» leyendo `cm_social_accounts` y
 * `cm_whatsapp_accounts`. Ninguna de las dos lo sabe: son registros **legacy**
 * que guardan lo que Meta autorizó, no lo que la plataforma puede recibir. El
 * canal operativo —el que consulta el webhook— vive en `smarttalk.channels`.
 *
 * La consecuencia era exactamente el defecto que la iteración 22 vino a cerrar,
 * sólo que en la capa de arriba: si `subscribed_apps` fallaba, el canal quedaba
 * en `error` y la tarjeta seguía pintándose verde, porque la fila legacy sí
 * existía. El usuario veía «Meta conectado» sobre un canal que no recibía nada.
 *
 * Qué hace este módulo
 * --------------------
 * Traduce las filas de `smarttalk.channels` a los cuatro estados que la
 * interfaz necesita distinguir, y sólo esos. Es **puro**: no importa el cliente
 * de Supabase, así que lo pueden usar tanto la ruta autenticada como el
 * componente de cliente sin arrastrar `service_role` al navegador.
 *
 *   - `active`       → conectado y recibiendo.
 *   - `error`        → la conexión existe pero el proveedor no quedó suscrito.
 *                      Se muestra la causa y la acción de reintento.
 *   - `disconnected` → desconectado a propósito; se ofrece conectar.
 *   - `missing`      → no hay canal; se ofrece conectar.
 *
 * `pending` (el valor por omisión de la columna) se normaliza a `error`: para
 * quien mira la pantalla significan lo mismo —la conexión no está terminada y
 * hace falta una acción—, y tratarlos distinto sólo abriría un cuarto estado
 * que nadie sabría interpretar.
 */

export type BrandChannelKind = "messenger" | "instagram" | "whatsapp";
export type BrandChannelState = "active" | "error" | "disconnected" | "missing";

/** Tipo de `smarttalk.channels` que respalda cada canal de la tarjeta. */
export const CHANNEL_TYPE_BY_KIND: Record<BrandChannelKind, string[]> = {
  messenger: ["facebook_messenger"],
  instagram: ["instagram"],
  whatsapp: ["whatsapp_business_api", "whatsapp_cloud_api"],
};

export const BRAND_CHANNEL_KINDS: BrandChannelKind[] = ["messenger", "instagram", "whatsapp"];

export interface BrandChannelStatus {
  kind: BrandChannelKind;
  /** `null` cuando no existe ninguna fila para este canal. */
  channelId: string | null;
  state: BrandChannelState;
  name: string | null;
  /** Page ID, Instagram Business ID o phone_number_id, según el canal. */
  assetId: string | null;
  /** Causa saneada del último fallo de activación. Nunca contiene secretos. */
  activationError: string | null;
}

export type BrandChannelMap = Record<BrandChannelKind, BrandChannelStatus>;

/** Fila mínima de `smarttalk.channels` que necesita el resumen. */
export interface BrandChannelRow {
  id: string;
  brand_id: string | null;
  type: string | null;
  status: string | null;
  name?: string | null;
  meta_business_id?: string | null;
  whatsapp_phone_number_id?: string | null;
  activation_error?: string | null;
  /**
   * `config.webhook_subscribed`. Tres valores con tres significados distintos:
   *
   *   - `true`  → la última activación confirmó la suscripción.
   *   - `false` → la última activación la intentó y el proveedor la rechazó.
   *   - ausente (`null`/`undefined`) → canal histórico, anterior a que se
   *     registrara el indicador. No se sabe, y no se degrada por no saber.
   */
  webhook_subscribed?: boolean | null;
}

export const ACTIVATION_PENDING_LABEL = "Pendiente de activación";

export const ACTIVATION_PENDING_HINT =
  "La suscripción al webhook no se completó, así que este canal no recibe mensajes.";

export function emptyChannelStatus(kind: BrandChannelKind): BrandChannelStatus {
  return { kind, channelId: null, state: "missing", name: null, assetId: null, activationError: null };
}

export function emptyBrandChannels(): BrandChannelMap {
  return {
    messenger: emptyChannelStatus("messenger"),
    instagram: emptyChannelStatus("instagram"),
    whatsapp: emptyChannelStatus("whatsapp"),
  };
}

function normalizeState(
  status: string | null | undefined,
  webhookSubscribed: boolean | null | undefined,
): BrandChannelState {
  if (status === "disconnected") return "disconnected";

  if (status === "active") {
    // `active` no es suficiente. Un canal puede quedarse en `active` con la
    // suscripción rechazada —por ejemplo si el UPDATE a `error` no llegó a
    // escribirse— y entonces la columna miente. `webhook_subscribed === false`
    // es la constancia explícita de que el proveedor no quedó suscrito, y pesa
    // más que el estado.
    //
    // Sólo el `false` explícito degrada: un canal histórico, creado antes de
    // que existiera el indicador, no tiene el campo y sigue mostrándose
    // conectado. Degradarlos a todos convertiría una mejora de precisión en una
    // alarma masiva sobre canales que funcionan.
    return webhookSubscribed === false ? "error" : "active";
  }

  // `error` y `pending` son lo mismo para quien mira: no recibe y hay que
  // actuar. Cualquier estado desconocido cae aquí por seguridad: no se pinta
  // verde algo que no sabemos leer.
  return "error";
}

/**
 * Cuando una marca tiene más de una fila del mismo tipo —datos antiguos, antes
 * del índice único de la migración 038— gana la más operativa. Es la que el
 * webhook tiene más probabilidades de elegir, y mostrar la peor asustaría sin
 * motivo.
 */
const STATE_PRIORITY: Record<BrandChannelState, number> = {
  active: 3,
  error: 2,
  disconnected: 1,
  missing: 0,
};

function kindOfType(type: string | null | undefined): BrandChannelKind | null {
  for (const kind of BRAND_CHANNEL_KINDS) {
    if (type && CHANNEL_TYPE_BY_KIND[kind].includes(type)) return kind;
  }
  return null;
}

/** Resume las filas de UNA marca en los tres canales de la tarjeta. */
export function summarizeBrandChannels(rows: BrandChannelRow[]): BrandChannelMap {
  const summary = emptyBrandChannels();

  for (const row of rows) {
    const kind = kindOfType(row.type);
    if (!kind) continue;

    const state = normalizeState(row.status, row.webhook_subscribed);
    if (STATE_PRIORITY[state] <= STATE_PRIORITY[summary[kind].state] && summary[kind].channelId) {
      continue;
    }

    summary[kind] = {
      kind,
      channelId: row.id,
      state,
      name: row.name ?? null,
      assetId:
        kind === "whatsapp"
          ? row.whatsapp_phone_number_id ?? null
          : row.meta_business_id ?? null,
      activationError: state === "error" ? row.activation_error ?? null : null,
    };
  }

  return summary;
}

/** Agrupa por marca. Las marcas sin canales quedan con el mapa vacío. */
export function summarizeChannelsByBrand(
  rows: BrandChannelRow[],
  brandIds: string[],
): Record<string, BrandChannelMap> {
  const byBrand: Record<string, BrandChannelRow[]> = {};
  for (const row of rows) {
    if (!row.brand_id) continue;
    (byBrand[row.brand_id] ||= []).push(row);
  }

  const result: Record<string, BrandChannelMap> = {};
  for (const brandId of brandIds) {
    result[brandId] = summarizeBrandChannels(byBrand[brandId] || []);
  }
  return result;
}

/**
 * La única función que debe decidir si se pinta la tarjeta verde.
 *
 * Deliberadamente NO acepta el registro legacy: que exista una fila en
 * `cm_social_accounts` no significa que el canal reciba, y admitirlo aquí como
 * segunda fuente reabriría el defecto.
 */
export function isChannelConnected(status: BrandChannelStatus | null | undefined): boolean {
  return status?.state === "active";
}

/** ¿Hay que ofrecer «Reintentar activación»? */
export function needsActivation(status: BrandChannelStatus | null | undefined): boolean {
  return status?.state === "error" && Boolean(status?.channelId);
}

/** ¿Se ofrece conectar desde cero? */
export function canConnect(status: BrandChannelStatus | null | undefined): boolean {
  return !status || status.state === "disconnected" || status.state === "missing";
}
