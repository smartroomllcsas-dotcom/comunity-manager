import { createAdminClient } from "@/lib/supabase/admin";
import {
  PENDING_SUBSCRIPTION_CONFIG,
  wasAssetOperational,
} from "@/lib/meta/channel-activation";

type MetaChannelType = "facebook_messenger" | "instagram";

/** Fila existente del canal, tal y como hace falta para decidir la identidad. */
interface ExistingChannelRow {
  id: string;
  type: string;
  status: string;
  meta_business_id?: string | null;
  config?: Record<string, unknown> | null;
}

/**
 * Activo que cubría la suscripción anterior.
 *
 * `meta_business_id` es la fuente buena. `config.legacy_id` es el respaldo para
 * las filas creadas por `sync-legacy` antes de que se rellenara la columna.
 */
function previousMetaAssetId(channel: ExistingChannelRow): string | null {
  if (channel.meta_business_id) return channel.meta_business_id;
  const legacyId = (channel.config || {}).legacy_id;
  return typeof legacyId === "string" ? legacyId : null;
}

type EnsureMetaChannelsInput = {
  organizationId: string;
  brandId: string;
  legacyAccountId: string;
  page: { id: string; name: string };
  instagram?: { id: string; username?: string } | null;
  pageAccessTokenCiphertext: string;
  connectedAt: string;
  tokenExpiresAt: string;
  includeInstagram: boolean;
};

export interface ReadyMetaChannel {
  id: string;
  type: MetaChannelType;
  /** Identificador del activo de Meta que Meta envía en `entry.id`. */
  assetId: string;
  /**
   * El canal ya existía y estaba `active` antes de esta operación.
   *
   * Lo consume `activateChannels`: una reconexión sobre un canal operativo no
   * puede degradarse a `error` si la llamada de suscripción falla, porque la
   * suscripción anterior sigue vigente y degradarlo sacaría al canal de
   * `findMatchingChannel` (que filtra por `status = 'active'`).
   */
  wasActive: boolean;
}

/**
 * Deja listos los canales operativos antes de declarar exitosa la conexión.
 * Así un mensaje enviado inmediatamente después del OAuth ya puede enrutarse
 * a la marca correcta, sin esperar a que /clients monte y ejecute sync-legacy.
 *
 * Se escribe `status: 'active'` desde el primer momento y **antes** de
 * suscribir el activo. Es deliberado: mientras Meta no tenga la suscripción no
 * envía nada, así que un canal activo sin suscripción no puede perder mensajes;
 * el orden inverso sí abriría la ventana que este módulo existe para cerrar.
 * Quien decide si esa conexión llega a contar como éxito es
 * `activateChannels`, con los identificadores que devuelve esta función.
 */
export async function ensureMetaChannelsReady(
  input: EnsureMetaChannelsInput,
): Promise<ReadyMetaChannel[]> {
  const smarttalk = createAdminClient("smarttalk");
  const { data, error } = await smarttalk
    .from("channels")
    .select("id,type,status,meta_business_id,config")
    .eq("organization_id", input.organizationId)
    .eq("brand_id", input.brandId);

  if (error) throw new Error(`No se pudieron consultar los canales de la marca: ${error.message}`);

  const current = (data || []) as ExistingChannelRow[];
  const ready: ReadyMetaChannel[] = [];

  async function save(type: MetaChannelType, assetId: string, payload: Record<string, unknown>) {
    const matches = current.filter((channel) => channel.type === type);
    if (matches.length > 1) {
      throw new Error(`La marca tiene más de un canal ${type}; se bloqueó la conexión para evitar enrutamiento ambiguo`);
    }

    if (matches[0]) {
      // Todo esto se lee ANTES del UPDATE: después, la fila ya dice `active` y
      // ya apunta al activo nuevo, así que la pregunta —¿este canal recibía por
      // ESTE mismo activo?— sólo tiene respuesta ahora.
      const wasActive = wasAssetOperational({
        status: matches[0].status,
        config: matches[0].config,
        assetPairs: [[previousMetaAssetId(matches[0]), assetId]],
      });
      const { error: updateError } = await smarttalk
        .from("channels")
        .update({
          ...payload,
          // El `config` anterior sólo se conserva cuando el activo no cambia.
          // Al cambiar de página o de cuenta hay que soltar los indicadores de
          // la suscripción vieja: heredar `webhook_subscribed: true` de la
          // Página A haría pasar por operativa una Página B que aún no lo es.
          config: {
            ...(wasActive ? (matches[0].config || {}) : {}),
            ...((payload.config || {}) as Record<string, unknown>),
            // Activo cambiado: no hay suscripción que lo cubra hasta que Meta
            // la confirme, y así queda escrito ANTES de preguntárselo. Si el
            // guardado del veredicto falla después, lo que queda es `false`.
            ...(wasActive ? {} : PENDING_SUBSCRIPTION_CONFIG),
          },
        })
        .eq("id", matches[0].id);
      if (updateError) throw new Error(`No se pudo actualizar el canal ${type}: ${updateError.message}`);
      ready.push({ id: matches[0].id, type, assetId, wasActive });
      return;
    }

    const { data: inserted, error: insertError } = await smarttalk
      .from("channels")
      .insert({
        ...payload,
        // Canal nuevo: nace no-conectado. Sólo una suscripción confirmada lo
        // asciende.
        config: {
          ...((payload.config || {}) as Record<string, unknown>),
          ...PENDING_SUBSCRIPTION_CONFIG,
        },
      })
      .select("id")
      .single();
    if (insertError) {
      // La comprobación previa de `findAssetConflict` es un SELECT seguido de
      // este INSERT: dos conexiones simultáneas sobre el mismo activo leen lo
      // mismo y concluyen lo mismo. Quien cierra esa ventana es el índice único
      // de la migración 038, y su 23505 llega aquí. Se traduce al mensaje
      // acordado en vez de propagar el texto de PostgreSQL, que hablaría de un
      // índice que el administrador no conoce.
      if ((insertError as { code?: string }).code === "23505") {
        throw new Error(
          "Este canal ya está conectado a otra marca. Desconéctalo allí antes de asignarlo a otra marca.",
        );
      }
      throw new Error(`No se pudo crear el canal ${type}: ${insertError.message}`);
    }

    const insertedId = (inserted as { id?: string } | null)?.id;
    if (!insertedId) {
      throw new Error(`No se pudo identificar el canal ${type} recién creado`);
    }
    ready.push({ id: insertedId, type, assetId, wasActive: false });
  }

  await save("facebook_messenger", input.page.id, {
    organization_id: input.organizationId,
    brand_id: input.brandId,
    type: "facebook_messenger",
    name: input.page.name || "Facebook",
    status: "active",
    access_token: null,
    access_token_ciphertext: input.pageAccessTokenCiphertext,
    facebook_app_id: process.env.META_APP_ID || null,
    // Para webhooks multimarcas este campo debe ser el activo que Meta envía
    // en entry.id, no el portafolio comercial compartido por varias páginas.
    meta_business_id: input.page.id,
    config: {
      legacy_source: "cm_social_accounts",
      legacy_type: "facebook",
      legacy_id: input.page.id,
      legacy_client_id: input.brandId,
      legacy_account_id: input.legacyAccountId,
      page_name: input.page.name,
    },
    connected_at: input.connectedAt,
    token_expires_at: input.tokenExpiresAt,
    updated_at: new Date().toISOString(),
  });

  if (input.includeInstagram && input.instagram?.id) {
    await save("instagram", input.instagram.id, {
      organization_id: input.organizationId,
      brand_id: input.brandId,
      type: "instagram",
      name: input.instagram.username
        ? `Instagram @${input.instagram.username}`
        : `${input.page.name} · Instagram`,
      status: "active",
      access_token: null,
      access_token_ciphertext: input.pageAccessTokenCiphertext,
      facebook_app_id: process.env.META_APP_ID || null,
      meta_business_id: input.instagram.id,
      config: {
        legacy_source: "cm_social_accounts",
        legacy_type: "instagram",
        legacy_id: input.instagram.id,
        legacy_client_id: input.brandId,
        legacy_account_id: input.legacyAccountId,
        instagram_username: input.instagram.username || null,
      },
      connected_at: input.connectedAt,
      token_expires_at: input.tokenExpiresAt,
      updated_at: new Date().toISOString(),
    });
  }

  return ready;
}

/**
 * Igual, pero para el Instagram Business Login directo.
 *
 * Ese flujo (`/api/auth/instagram/connect` → `/api/auth/instagram/callback`) no
 * pasa por una página de Facebook: autoriza la cuenta de Instagram por su
 * cuenta. Hasta ahora escribía sólo `cm_social_accounts` y **no creaba ningún
 * canal**: la interfaz decía «Instagram conectado: @x» y el canal operativo no
 * aparecía hasta que alguien abría /clients y disparaba `sync-legacy`. Es
 * exactamente el defecto que esta iteración cierra, intacto en otra ruta.
 */
export async function ensureInstagramChannelReady(input: {
  organizationId: string;
  brandId: string;
  legacyAccountId: string | null;
  instagram: { id: string; username?: string | null };
  accessTokenCiphertext: string;
  connectedAt: string;
  tokenExpiresAt: string | null;
}): Promise<ReadyMetaChannel> {
  const smarttalk = createAdminClient("smarttalk");
  const { data, error } = await smarttalk
    .from("channels")
    .select("id,type,status,meta_business_id,config")
    .eq("organization_id", input.organizationId)
    .eq("brand_id", input.brandId)
    .eq("type", "instagram");

  if (error) throw new Error(`No se pudieron consultar los canales de la marca: ${error.message}`);

  const matches = (data || []) as ExistingChannelRow[];
  if (matches.length > 1) {
    throw new Error(
      "La marca tiene más de un canal instagram; se bloqueó la conexión para evitar enrutamiento ambiguo",
    );
  }

  const payload = {
    organization_id: input.organizationId,
    brand_id: input.brandId,
    type: "instagram",
    name: input.instagram.username ? `Instagram @${input.instagram.username}` : "Instagram",
    status: "active",
    access_token: null,
    access_token_ciphertext: input.accessTokenCiphertext,
    facebook_app_id: process.env.META_APP_ID || null,
    meta_business_id: input.instagram.id,
    config: {
      legacy_source: "cm_social_accounts",
      legacy_type: "instagram",
      legacy_id: input.instagram.id,
      legacy_client_id: input.brandId,
      legacy_account_id: input.legacyAccountId,
      instagram_username: input.instagram.username || null,
      connected_via: "instagram_business_login",
    },
    connected_at: input.connectedAt,
    token_expires_at: input.tokenExpiresAt,
    updated_at: new Date().toISOString(),
  };

  if (matches[0]) {
    // Misma regla que en el flujo por página: cambiar de cuenta de Instagram es
    // estrenar activo, y un fallo de suscripción sobre un activo nuevo no puede
    // quedarse en `active`.
    const wasActive = wasAssetOperational({
      status: matches[0].status,
      config: matches[0].config,
      assetPairs: [[previousMetaAssetId(matches[0]), input.instagram.id]],
    });
    const { error: updateError } = await smarttalk
      .from("channels")
      .update({
        ...payload,
        config: {
          ...(wasActive ? (matches[0].config || {}) : {}),
          ...payload.config,
          ...(wasActive ? {} : PENDING_SUBSCRIPTION_CONFIG),
        },
      })
      .eq("id", matches[0].id);
    if (updateError) throw new Error(`No se pudo actualizar el canal instagram: ${updateError.message}`);
    return { id: matches[0].id, type: "instagram", assetId: input.instagram.id, wasActive };
  }

  const { data: inserted, error: insertError } = await smarttalk
    .from("channels")
    .insert({
      ...payload,
      config: { ...payload.config, ...PENDING_SUBSCRIPTION_CONFIG },
    })
    .select("id")
    .single();
  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      throw new Error(
        "Este canal ya está conectado a otra marca. Desconéctalo allí antes de asignarlo a otra marca.",
      );
    }
    throw new Error(`No se pudo crear el canal instagram: ${insertError.message}`);
  }

  const insertedId = (inserted as { id?: string } | null)?.id;
  if (!insertedId) throw new Error("No se pudo identificar el canal instagram recién creado");

  return { id: insertedId, type: "instagram", assetId: input.instagram.id, wasActive: false };
}
