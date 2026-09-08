/**
 * ¿Hay en la cola de webhooks otro mensaje ENTRANTE del mismo cliente, más
 * nuevo que el que estamos atendiendo? Si sí, esta ejecución no responde: la
 * del mensaje más nuevo responderá con todo el contexto.
 *
 * Complementa la agrupación por tiempo de ai.ts: cuando la cola procesa los
 * eventos en serie, el segundo mensaje todavía no está guardado durante la
 * espera del primero y el agente contestaba dos veces ("3222758030" + "").
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type WahaPayload = { event?: string; payload?: { from?: string; fromMe?: boolean; _data?: { key?: { remoteJidAlt?: string } } } };
type MetaPayload = {
  entry?: Array<{ messaging?: Array<{ sender?: { id?: string }; message?: { is_echo?: boolean; mid?: string } }> }>;
};

/** true si el evento es un mensaje entrante (no eco, no ack) del cliente `waId`. */
export function payloadHasInboundFrom(channel: string, payload: unknown, waId: string): boolean {
  if (!payload || typeof payload !== "object" || !waId) return false;
  if (channel === "waha") {
    const p = payload as WahaPayload;
    if (p.event !== "message" && p.event !== "message.any") return false;
    if (p.payload?.fromMe) return false;
    const from = String(p.payload?.from || "");
    const alt = String(p.payload?._data?.key?.remoteJidAlt || "");
    return from.split("@")[0] === waId || alt.split("@")[0] === waId;
  }
  const m = payload as MetaPayload;
  for (const e of m.entry || []) {
    for (const ev of e.messaging || []) {
      if (ev.message && !ev.message.is_echo && String(ev.sender?.id || "") === waId) return true;
    }
  }
  return false;
}

export async function hasNewerPendingInbound(
  admin: Pick<SupabaseClient, "from">,
  input: { contactWaId: string; afterIso: string },
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("webhook_events")
      .select("channel, payload")
      .in("status", ["pending", "processing"])
      .gt("created_at", input.afterIso)
      .order("created_at", { ascending: true })
      .limit(60);
    return ((data || []) as Array<{ channel: string; payload: unknown }>).some((row) =>
      payloadHasInboundFrom(row.channel, row.payload, input.contactWaId)
    );
  } catch {
    return false;
  }
}
