/**
 * ¿Un asesor humano está atendiendo esta conversación?
 *
 * Se considera que sí cuando en las últimas `hours` horas hay un mensaje
 * saliente escrito por una persona (no por el agente de IA ni por una
 * automatización), o una nota interna escrita por una persona. Mientras sea
 * así, el agente de IA no responde y el seguimiento automático no se mete.
 *
 * Los ecos del propio agente (WhatsApp por QR) se guardan como salientes sin
 * is_bot; se descartan comparando el texto con el de los mensajes del bot.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const HUMAN_ACTIVE_HOURS = 24;
const SYSTEM_NOTE_PREFIXES = ["[IA]", "[Agenda]", "[Sistema]", "[Difusión]"];

type Admin = Pick<SupabaseClient, "from">;

export async function humanRepliedRecently(
  admin: Admin,
  conversationId: string,
  hours: number = HUMAN_ACTIVE_HOURS
): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  try {
    const { data } = await admin
      .from("messages")
      .select("is_bot, content")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40);
    const rows = (data || []) as Array<{ is_bot: boolean | null; content: { text?: string } | null }>;
    const botTexts = new Set(rows.filter((m) => m.is_bot).map((m) => String(m.content?.text || "").trim()));
    if (rows.some((m) => !m.is_bot && !botTexts.has(String(m.content?.text || "").trim()))) return true;
  } catch {
    // si falla la consulta, no bloqueamos al agente
  }
  try {
    const { data: notes } = await admin
      .from("internal_notes")
      .select("content")
      .eq("conversation_id", conversationId)
      .gte("created_at", since)
      .limit(20);
    if ((notes || []).some((n) => !SYSTEM_NOTE_PREFIXES.some((p) => String((n as { content: string }).content || "").startsWith(p)))) return true;
  } catch {
    // idem
  }
  return false;
}

/** Última salida escrita por una persona (para el seguimiento automático). */
export function lastOutboundIsHuman(
  msgs: Array<{ direction: string; is_bot?: boolean | null; content?: { text?: string } | null }>
): boolean {
  const outbound = msgs.filter((m) => m.direction === "outbound");
  if (!outbound.length) return false;
  const botTexts = new Set(outbound.filter((m) => m.is_bot).map((m) => String(m.content?.text || "").trim()));
  const last = outbound[0];
  return !last.is_bot && !botTexts.has(String(last.content?.text || "").trim());
}
