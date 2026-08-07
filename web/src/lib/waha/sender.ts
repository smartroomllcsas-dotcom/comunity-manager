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

  return { externalId: (r as { id: string }).id };
}
