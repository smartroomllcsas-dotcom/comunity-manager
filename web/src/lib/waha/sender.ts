// Outbound sender for waha channels.
// TODO(sprint 28): wire into the central inbox outbound dispatcher so messages
// composed in the Inbox UI for channel.type='waha' route through this function.
// For now this is the standalone helper used by direct API callers (e.g., tests).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WahaClient } from "./client";

export interface SendWahaTextInput {
  admin: Pick<SupabaseClient, "from">;
  channelId: string;
  toPhone: string;
  text: string;
  client: WahaClient;
}

export async function sendWahaText(
  input: SendWahaTextInput
): Promise<{ externalId: string }> {
  const digits = input.toPhone.replace(/\D/g, "");
  if (!digits) throw new Error("toPhone empty");

  const { data: session } = await input.admin
    .from("waha_sessions")
    .select("session_name")
    .eq("channel_id", input.channelId)
    .maybeSingle();

  if (!session) {
    throw new Error("no waha session for channel");
  }

  const r = await input.client.sendText({
    session: (session as { session_name: string }).session_name,
    chatId: `${digits}@c.us`,
    text: input.text,
  });

  return { externalId: wahaExternalId(r, `${digits}@c.us`) };
}

/**
 * Id del mensaje tal como llegará luego en el webhook (`true_<chat>_<id>`),
 * para que el eco fromMe se reconozca como el mismo mensaje. WAHA responde
 * distinto según el motor: `id` string, `id._serialized` (WEBJS) o
 * `key.id` (NOWEB).
 */
export function wahaExternalId(r: unknown, chatId: string): string {
  const o = (r ?? {}) as {
    id?: string | { _serialized?: string; id?: string };
    key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  };
  if (typeof o.id === "string" && o.id) return o.id;
  if (o.id && typeof o.id === "object") {
    if (o.id._serialized) return o.id._serialized;
    if (o.id.id) return `true_${chatId}_${o.id.id}`;
  }
  if (o.key?.id) {
    // NOWEB responde remoteJid como 57...@s.whatsapp.net; el webhook del eco
    // usa 57...@c.us. Se normaliza para que el eco se reconozca como el mismo.
    const jid = (o.key.remoteJid || chatId).replace(/@s\.whatsapp\.net$/, "@c.us");
    return `true_${jid}_${o.key.id}`;
  }
  return "";
}
