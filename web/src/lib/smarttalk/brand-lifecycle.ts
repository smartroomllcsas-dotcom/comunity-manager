/**
 * Desactivación y reactivación reversible de marcas.
 *
 * Qué garantiza este módulo, y qué NO
 * -----------------------------------
 * Garantiza que desactivar una marca **no borra nada**: sólo cambia
 * `public.cm_clients.status` a `paused` y baja sus canales a `disconnected`,
 * guardando antes el estado que tenía cada uno. Contactos, conversaciones,
 * mensajes, cuentas sociales, credenciales cifradas y asignaciones de asesores
 * se quedan exactamente donde estaban. La suscripción de la agencia no se toca.
 *
 * No garantiza que un canal vuelva a funcionar al reactivar: si el proveedor
 * revocó el token durante la pausa, el canal queda en `pending` y la interfaz
 * pide reconexión. Fingir un `active` sería peor que decir la verdad.
 *
 * Orden de las escrituras
 * -----------------------
 * Al desactivar se marca **primero la marca** y después se bajan los canales.
 * Es deliberado: PostgREST no da transacción entre tablas de esquemas
 * distintos, así que hay que elegir qué pasa si el proceso muere a mitad. Con
 * este orden el peor caso es «marca pausada con algún canal aún activo», y la
 * recepción ya está bloqueada porque los webhooks consultan el estado de la
 * marca. Con el orden inverso el peor caso sería «canales caídos con la marca
 * viva», que además de no bloquear nada parecería una avería.
 *
 * Idempotencia
 * ------------
 * Desactivar una marca ya pausada no duplica filas: el estado por canal se
 * escribe con UPSERT sobre `channel_id` (índice único de la migración 036) y la
 * operación se registra con `was_noop = true`. Lo mismo al reactivar una marca
 * que ya está activa.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BRAND_STATUS_ACTIVE,
  BRAND_STATUS_PAUSED,
  RECONNECTION_NOTES,
  isPausedBrandStatus,
  type ChannelReactivationNote,
} from "./brand-status";

export type BrandLifecycleAction = "deactivate" | "reactivate";

export interface BrandLifecycleActor {
  agentId: string;
  email?: string | null;
}

export interface BrandRow {
  id: string;
  name: string | null;
  status: string | null;
  smarttalk_organization_id: string | null;
}

export interface ChannelOutcome {
  channelId: string;
  channelName: string | null;
  previousStatus: string;
  newStatus: string;
  note: ChannelReactivationNote | null;
}

export interface BrandLifecycleResult {
  brandId: string;
  brandStatus: string;
  /** false cuando la marca ya estaba en el estado pedido (llamada idempotente). */
  changed: boolean;
  channels: ChannelOutcome[];
  /** Canales que quedaron pidiendo reconexión tras reactivar. */
  needsReconnection: ChannelOutcome[];
}

export class BrandLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: "brand_not_found" | "write_failed",
  ) {
    super(message);
    this.name = "BrandLifecycleError";
  }
}

function brandLog(level: "info" | "warn", event: string, context: Record<string, unknown>) {
  const line = `[brand-lifecycle] ${event} ${JSON.stringify({ event, ...context })}`;
  if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Marca dentro de la organización indicada.
 *
 * El filtro por organización va en la consulta, no en una comprobación
 * posterior: así una marca ajena es indistinguible de una inexistente y el
 * endpoint puede responder 404 sin revelar que existe.
 */
export async function getBrandInOrg(
  brandId: string,
  organizationId: string,
): Promise<BrandRow | null> {
  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from("cm_clients")
    .select("id, name, status, smarttalk_organization_id")
    .eq("id", brandId)
    .eq("smarttalk_organization_id", organizationId)
    .maybeSingle();

  if (error) throw new BrandLifecycleError(error.message, "write_failed");
  return (data as BrandRow | null) ?? null;
}

/**
 * ¿Está pausada esta marca?
 *
 * Es la consulta que usan los guardas de webhooks y de envío. Ante un error de
 * lectura devuelve `false` —no bloquea— porque un fallo transitorio de la base
 * no debe tumbar la recepción de mensajes de las marcas sanas. El canal
 * `disconnected` sigue siendo la barrera principal.
 */
export async function isBrandPaused(brandId: string | null | undefined): Promise<boolean> {
  if (!brandId) return false;
  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from("cm_clients")
    .select("status")
    .eq("id", brandId)
    .maybeSingle();

  if (error) {
    brandLog("warn", "brand_status_lookup_failed", { brand_id: brandId, error: error.message });
    return false;
  }
  return isPausedBrandStatus((data as { status?: string | null } | null)?.status);
}

/** Marcas pausadas de una organización. Para filtrar listados de una sola vez. */
export async function getPausedBrandIds(organizationId: string): Promise<string[]> {
  const publicAdmin = createAdminClient("public");
  const { data, error } = await publicAdmin
    .from("cm_clients")
    .select("id")
    .eq("smarttalk_organization_id", organizationId)
    .eq("status", BRAND_STATUS_PAUSED);

  if (error) {
    brandLog("warn", "paused_brands_lookup_failed", {
      organization_id: organizationId,
      error: error.message,
    });
    return [];
  }
  return (data || []).map((row) => (row as { id: string }).id);
}

export interface ChannelNeedingReconnection {
  channelId: string;
  channelName: string | null;
  note: ChannelReactivationNote;
}

/**
 * Canales que quedaron pidiendo reconexión tras reactivar una marca.
 *
 * Existe porque el aviso no puede vivir sólo en la respuesta del POST: quien
 * recarga la página perdería la única señal de que un canal no volvió, y la
 * marca ya no está pausada, así que tampoco hay nada en la interfaz que lo
 * sugiera.
 *
 * **Se deriva del estado actual del canal, no sólo de la nota histórica.**
 * `reactivation_note` es un registro de lo que pasó aquella vez y nunca
 * caduca; si el aviso dependiera sólo de ella, seguiría apareciendo para
 * siempre aunque el operador ya hubiera reconectado el canal. Cruzándolo con
 * el estado vigente el aviso se apaga solo en cuanto el canal vuelve a
 * `active`, sin necesidad de que nadie lo marque como resuelto.
 */
export async function getChannelsNeedingReconnection(
  organizationId: string,
  brandIds: string[],
): Promise<Map<string, ChannelNeedingReconnection[]>> {
  const result = new Map<string, ChannelNeedingReconnection[]>();
  const unique = [...new Set(brandIds.filter(Boolean))];
  if (unique.length === 0) return result;

  const admin = createAdminClient("smarttalk");
  const { data: pauseRows, error } = await admin
    .from("brand_channel_pause_state")
    .select("brand_id, channel_id, reactivation_note")
    .eq("organization_id", organizationId)
    .in("brand_id", unique)
    .in("reactivation_note", RECONNECTION_NOTES);

  if (error) {
    brandLog("warn", "reconnection_lookup_failed", {
      organization_id: organizationId,
      error: error.message,
    });
    return result;
  }
  if (!pauseRows || pauseRows.length === 0) return result;

  const rows = pauseRows as {
    brand_id: string;
    channel_id: string;
    reactivation_note: ChannelReactivationNote;
  }[];

  const { data: channelRows } = await admin
    .from("channels")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .in("id", rows.map((row) => row.channel_id));

  const channelsById = new Map(
    ((channelRows || []) as { id: string; name: string | null; status: string }[]).map(
      (channel) => [channel.id, channel],
    ),
  );

  for (const row of rows) {
    const channel = channelsById.get(row.channel_id);
    // Ya reconectado: el aviso se apaga solo.
    if (channel && channel.status === "active") continue;
    // Canal desaparecido: se conserva el aviso aunque no haya fila que mirar.
    if (!channel && row.reactivation_note !== "channel_missing") continue;

    const list = result.get(row.brand_id) || [];
    list.push({
      channelId: row.channel_id,
      channelName: channel?.name ?? null,
      note: row.reactivation_note,
    });
    result.set(row.brand_id, list);
  }

  return result;
}

async function recordLifecycleEvent(input: {
  brandId: string;
  organizationId: string;
  action: BrandLifecycleAction;
  wasNoop: boolean;
  previousBrandStatus: string | null;
  newBrandStatus: string | null;
  channelsAffected: number;
  actor: BrandLifecycleActor;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient("smarttalk");
  const { error } = await admin.from("brand_lifecycle_events").insert({
    brand_id: input.brandId,
    organization_id: input.organizationId,
    action: input.action,
    was_noop: input.wasNoop,
    previous_brand_status: input.previousBrandStatus,
    new_brand_status: input.newBrandStatus,
    channels_affected: input.channelsAffected,
    actor_agent_id: input.actor.agentId,
    actor_email: input.actor.email ?? null,
    metadata: input.metadata ?? {},
  });

  // La auditoría no puede tumbar la operación: la marca ya quedó pausada y
  // revertirla por no haber podido escribir una bitácora sería peor. Se avisa
  // en el log para que el fallo sea visible en vez de silencioso.
  if (error) {
    brandLog("warn", "lifecycle_event_write_failed", {
      brand_id: input.brandId,
      action: input.action,
      error: error.message,
    });
  }
}

/**
 * Estado al que debe volver la marca al reactivarse.
 *
 * Se lee del último `deactivate` registrado: una marca que estaba en
 * `onboarding` cuando se pausó debe volver a `onboarding`, no saltar a
 * `active` y darse por configurada.
 */
async function previousOperationalStatus(brandId: string): Promise<string> {
  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("brand_lifecycle_events")
    .select("previous_brand_status")
    .eq("brand_id", brandId)
    .eq("action", "deactivate")
    .eq("was_noop", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return BRAND_STATUS_ACTIVE;
  const previous = (data[0] as { previous_brand_status?: string | null }).previous_brand_status;
  if (!previous || isPausedBrandStatus(previous)) return BRAND_STATUS_ACTIVE;
  return previous;
}

/**
 * Desactiva una marca. Idempotente.
 *
 * No borra absolutamente nada: el único DELETE que existiría —limpiar
 * asignaciones de asesores— se descartó a propósito. Retirar las asignaciones
 * obligaría a rehacerlas a mano al reactivar y perdería quién atendía qué. En
 * su lugar, la marca pausada deja de aparecer como asignable y sus
 * conversaciones dejan de admitir operaciones nuevas, que es el efecto que se
 * buscaba sin destruir el historial.
 */
export async function deactivateBrand(input: {
  brand: BrandRow;
  organizationId: string;
  actor: BrandLifecycleActor;
}): Promise<BrandLifecycleResult> {
  const { brand, organizationId, actor } = input;
  const admin = createAdminClient("smarttalk");
  const publicAdmin = createAdminClient("public");

  if (isPausedBrandStatus(brand.status)) {
    await recordLifecycleEvent({
      brandId: brand.id,
      organizationId,
      action: "deactivate",
      wasNoop: true,
      previousBrandStatus: brand.status,
      newBrandStatus: brand.status,
      channelsAffected: 0,
      actor,
    });
    return {
      brandId: brand.id,
      brandStatus: BRAND_STATUS_PAUSED,
      changed: false,
      channels: [],
      needsReconnection: [],
    };
  }

  const previousStatus = brand.status ?? BRAND_STATUS_ACTIVE;

  // 1. La marca primero: corta la recepción aunque lo demás falle.
  const { error: brandError } = await publicAdmin
    .from("cm_clients")
    .update({ status: BRAND_STATUS_PAUSED })
    .eq("id", brand.id)
    .eq("smarttalk_organization_id", organizationId);

  if (brandError) throw new BrandLifecycleError(brandError.message, "write_failed");

  // 2. Canales que todavía no estaban caídos. Los ya `disconnected` no se
  //    tocan ni se registran: no hay nada que restaurar en ellos.
  const { data: channelRows, error: channelsError } = await admin
    .from("channels")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .eq("brand_id", brand.id)
    .neq("status", "disconnected");

  if (channelsError) throw new BrandLifecycleError(channelsError.message, "write_failed");

  const channels: ChannelOutcome[] = [];
  for (const row of (channelRows || []) as { id: string; name: string | null; status: string }[]) {
    // UPSERT sobre channel_id: pausar dos veces reescribe la misma fila.
    const { error: stateError } = await admin.from("brand_channel_pause_state").upsert(
      {
        channel_id: row.id,
        brand_id: brand.id,
        organization_id: organizationId,
        previous_status: row.status,
        paused_at: new Date().toISOString(),
        paused_by: actor.agentId,
        reactivated_at: null,
        reactivated_by: null,
        reactivation_note: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" },
    );

    if (stateError) throw new BrandLifecycleError(stateError.message, "write_failed");

    const { error: updateError } = await admin
      .from("channels")
      .update({ status: "disconnected" })
      .eq("id", row.id)
      .eq("organization_id", organizationId);

    if (updateError) throw new BrandLifecycleError(updateError.message, "write_failed");

    channels.push({
      channelId: row.id,
      channelName: row.name,
      previousStatus: row.status,
      newStatus: "disconnected",
      note: null,
    });
  }

  await recordLifecycleEvent({
    brandId: brand.id,
    organizationId,
    action: "deactivate",
    wasNoop: false,
    previousBrandStatus: previousStatus,
    newBrandStatus: BRAND_STATUS_PAUSED,
    channelsAffected: channels.length,
    actor,
  });

  brandLog("info", "brand_deactivated", {
    brand_id: brand.id,
    organization_id: organizationId,
    channels_disconnected: channels.length,
    actor_agent_id: actor.agentId,
  });

  return {
    brandId: brand.id,
    brandStatus: BRAND_STATUS_PAUSED,
    changed: true,
    channels,
    needsReconnection: [],
  };
}

/**
 * Reactiva una marca. Idempotente.
 *
 * Restaura **sólo** los canales cuyo estado previo era `active`. Un canal que
 * ya estaba `pending` o `error` antes de la pausa se queda como estaba: la
 * pausa no puede arreglar lo que ya venía roto, y devolverlo a `active` sería
 * inventar una conexión que nunca existió.
 */
export async function reactivateBrand(input: {
  brand: BrandRow;
  organizationId: string;
  actor: BrandLifecycleActor;
  /** Inyectable en pruebas para no depender del reloj real. */
  now?: Date;
}): Promise<BrandLifecycleResult> {
  const { brand, organizationId, actor } = input;
  const now = input.now ?? new Date();
  const admin = createAdminClient("smarttalk");
  const publicAdmin = createAdminClient("public");

  if (!isPausedBrandStatus(brand.status)) {
    await recordLifecycleEvent({
      brandId: brand.id,
      organizationId,
      action: "reactivate",
      wasNoop: true,
      previousBrandStatus: brand.status,
      newBrandStatus: brand.status,
      channelsAffected: 0,
      actor,
    });
    return {
      brandId: brand.id,
      brandStatus: brand.status ?? BRAND_STATUS_ACTIVE,
      changed: false,
      channels: [],
      needsReconnection: [],
    };
  }

  const targetStatus = await previousOperationalStatus(brand.id);

  const { data: pauseRows, error: pauseError } = await admin
    .from("brand_channel_pause_state")
    .select("id, channel_id, previous_status")
    .eq("brand_id", brand.id)
    .eq("organization_id", organizationId)
    .is("reactivated_at", null);

  if (pauseError) throw new BrandLifecycleError(pauseError.message, "write_failed");

  const channels: ChannelOutcome[] = [];

  for (const row of (pauseRows || []) as {
    id: string;
    channel_id: string;
    previous_status: string;
  }[]) {
    const { data: channel } = await admin
      .from("channels")
      .select("id, name, status, token_expires_at")
      .eq("id", row.channel_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    let note: ChannelReactivationNote | null = null;
    let newStatus: string;

    if (!channel) {
      // El canal desapareció durante la pausa (lo borró un administrador o el
      // proveedor). No hay nada que restaurar; se sella la fila con el motivo.
      note = "channel_missing";
      newStatus = "disconnected";
    } else if (row.previous_status !== "active") {
      // No estaba operativo antes de la pausa: se queda como está.
      note = "previously_inactive";
      newStatus = (channel as { status: string }).status;
    } else {
      const expiresAt = (channel as { token_expires_at: string | null }).token_expires_at;
      const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= now.getTime());
      newStatus = expired ? "pending" : "active";
      if (expired) note = "token_expired";

      const { error: updateError } = await admin
        .from("channels")
        .update({ status: newStatus })
        .eq("id", row.channel_id)
        .eq("organization_id", organizationId);

      if (updateError) throw new BrandLifecycleError(updateError.message, "write_failed");
    }

    const { error: sealError } = await admin
      .from("brand_channel_pause_state")
      .update({
        reactivated_at: now.toISOString(),
        reactivated_by: actor.agentId,
        reactivation_note: note,
        updated_at: now.toISOString(),
      })
      .eq("id", row.id);

    if (sealError) throw new BrandLifecycleError(sealError.message, "write_failed");

    channels.push({
      channelId: row.channel_id,
      channelName: (channel as { name?: string | null } | null)?.name ?? null,
      previousStatus: row.previous_status,
      newStatus,
      note,
    });
  }

  const { error: brandError } = await publicAdmin
    .from("cm_clients")
    .update({ status: targetStatus })
    .eq("id", brand.id)
    .eq("smarttalk_organization_id", organizationId);

  if (brandError) throw new BrandLifecycleError(brandError.message, "write_failed");

  const needsReconnection = channels.filter(
    (channel) => channel.note === "token_expired" || channel.note === "channel_missing",
  );

  await recordLifecycleEvent({
    brandId: brand.id,
    organizationId,
    action: "reactivate",
    wasNoop: false,
    previousBrandStatus: BRAND_STATUS_PAUSED,
    newBrandStatus: targetStatus,
    channelsAffected: channels.length,
    actor,
    metadata: { needs_reconnection: needsReconnection.length },
  });

  brandLog("info", "brand_reactivated", {
    brand_id: brand.id,
    organization_id: organizationId,
    channels_restored: channels.length - needsReconnection.length,
    channels_need_reconnection: needsReconnection.length,
    actor_agent_id: actor.agentId,
  });

  return {
    brandId: brand.id,
    brandStatus: targetStatus,
    changed: true,
    channels,
    needsReconnection,
  };
}
