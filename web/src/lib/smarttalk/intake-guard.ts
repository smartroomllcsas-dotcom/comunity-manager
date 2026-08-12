/**
 * Guarda única de recepción: ¿este canal puede admitir tráfico entrante?
 *
 * Por qué existe una sola función en vez de una comprobación por webhook
 * ------------------------------------------------------------------------
 * Los cuatro proveedores (WhatsApp, Messenger, Instagram, Respond.io) resuelven
 * el canal de forma distinta, pero la pregunta que deben hacerse es idéntica.
 * Tenerla escrita cuatro veces es exactamente cómo se cuela la quinta ruta que
 * se olvida de preguntarla.
 *
 * Dos barreras, no una
 * --------------------
 *   1. **El canal está `disconnected`.** Es la barrera principal y ya existía:
 *      la mayoría de los caminos de ingesta filtran por `status = 'active'`.
 *      Desactivar una marca deja todos sus canales así.
 *   2. **La marca está pausada.** Es la red de seguridad. Cubre el hueco de un
 *      canal que quedara operativo pese a la pausa —una escritura a medias, un
 *      canal creado por otra vía— y hace que la intención de negocio quede
 *      escrita donde se aplica.
 *
 * La respuesta al proveedor es siempre **200**. Un 4xx o un 5xx provocaría
 * reintentos durante horas y, en Meta, la baja automática de la suscripción del
 * webhook. Se acusa recibo y se descarta el evento.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { isBrandPaused } from "./brand-lifecycle";

export interface IntakeChannelLike {
  id?: string;
  status?: string | null;
  brand_id?: string | null;
}

export type IntakeBlockReason = "inactive_brand" | "channel_not_active" | "channel_not_found";

export interface IntakeDecision {
  blocked: boolean;
  reason: IntakeBlockReason | null;
}

const ALLOWED: IntakeDecision = { blocked: false, reason: null };

/**
 * Decide si un canal ya cargado puede recibir.
 *
 * El orden importa para el diagnóstico: si el canal está caído se informa de
 * eso, aunque además su marca esté pausada. Sólo cuando el canal está sano y
 * aun así se rechaza, el motivo es la marca.
 */
export async function evaluateChannelIntake(
  channel: IntakeChannelLike | null | undefined,
): Promise<IntakeDecision> {
  if (!channel) return { blocked: true, reason: "channel_not_found" };

  if (await isBrandPaused(channel.brand_id)) {
    return { blocked: true, reason: "inactive_brand" };
  }
  if (channel.status && channel.status !== "active") {
    return { blocked: true, reason: "channel_not_active" };
  }
  return ALLOWED;
}

/**
 * Igual que la anterior, pero partiendo del `phone_number_id` de WhatsApp.
 *
 * Busca el canal **sin filtrar por estado**, al contrario que
 * `processIncomingMessage`. Es la diferencia entre «no encuentro canal» y
 * «el canal existe pero su marca está inactiva», y es lo que permite
 * responderle al proveedor con un motivo cierto en vez de un silencio.
 */
export async function evaluateWhatsAppIntake(
  phoneNumberId: string | null | undefined,
): Promise<IntakeDecision> {
  if (!phoneNumberId) return { blocked: true, reason: "channel_not_found" };

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("channels")
    .select("id, status, brand_id")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();

  // Un fallo de lectura no debe bloquear: se deja pasar y que decidan los
  // filtros de siempre. Bloquear ante un error convertiría una incidencia de
  // base de datos en pérdida de mensajes.
  if (error) return ALLOWED;
  if (!data) return { blocked: true, reason: "channel_not_found" };

  return evaluateChannelIntake(data as IntakeChannelLike);
}

/** Marcas pausadas entre las indicadas. Para filtrar lotes sin N consultas. */
export async function filterPausedBrandIds(brandIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(brandIds.filter(Boolean))];
  if (unique.length === 0) return new Set();

  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from("cm_clients")
    .select("id")
    .in("id", unique)
    .eq("status", "paused");

  if (error) return new Set();
  return new Set((data || []).map((row) => (row as { id: string }).id));
}
