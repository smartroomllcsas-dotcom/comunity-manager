// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = Pick<import("@supabase/supabase-js").SupabaseClient<any, any, any>, "from">;
import type { WahaMessageEvent } from "./types";

interface Args {
  id: string;
  payload: WahaMessageEvent;
  admin: AnySupabaseClient;
}

export async function processWahaWebhookEvent(
  args: Args
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { payload, admin } = args;
  const sessionName = payload.session;
  if (!sessionName) return { ok: false, error: "missing session name" };

  // === session.status: sync waha_sessions + channels
  if (payload.event === "session.status") {
    const p = payload.payload as {
      status?: string;
      me?: { id?: string; pushname?: string };
    };
    const status = String(p.status ?? "");
    if (!status) return { ok: false, error: "missing status in session.status payload" };

    const now = new Date().toISOString();
    const meId = p.me?.id;
    const pushName = p.me?.pushname;

    const sessionUpdate: Record<string, unknown> = { status, last_status_at: now };
    if (meId) sessionUpdate.phone_number = meId.split("@")[0];
    if (pushName) sessionUpdate.push_name = pushName;

    const { data: session, error: updateErr } = await admin
      .from("waha_sessions")
      .update(sessionUpdate)
      .eq("session_name", sessionName)
      .select("channel_id")
      .maybeSingle();

    if (updateErr) return { ok: false, error: updateErr.message };
    if (!session) return { ok: false, error: `no waha session for name ${sessionName}` };

    const channelStatus =
      status === "WORKING"
        ? "active"
        : status === "FAILED" || status === "STOPPED"
        ? "disconnected"
        : "pending";

    const channelUpdate: Record<string, unknown> = { status: channelStatus };
    if (status === "WORKING") channelUpdate.connected_at = now;

    const { error: chErr } = await admin
      .from("channels")
      .update(channelUpdate)
      .eq("id", (session as { channel_id: string }).channel_id);
    if (chErr) return { ok: false, error: chErr.message };

    return { ok: true };
  }

  // TODO(sprint 28): full inbox ingestion for message | message.any | message.ack.
  // Mirror respond-io/route.ts logic:
  //   1. Look up channel via waha_sessions.session_name
  //   2. Upsert smarttalk.contacts (org_id, brand_id, wa_id, name)
  //   3. Upsert smarttalk.conversations (org_id, brand_id, contact_id, channel_id)
  //   4. Insert smarttalk.messages (conversation_id, direction, body, external_id, timestamp)
  //   5. For message.ack: update the outbound row's ack fields
  // For now: return ok:true so the row is marked processed and doesn't retry endlessly.
  return { ok: true };
}
