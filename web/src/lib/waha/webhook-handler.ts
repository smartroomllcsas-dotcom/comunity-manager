// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = Pick<import("@supabase/supabase-js").SupabaseClient<any, any, any>, "from">;
import type { WahaMessageEvent } from "./types";
import { checkBillingFeature } from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";

interface Args {
  id: string;
  payload: WahaMessageEvent;
  admin: AnySupabaseClient;
}

function mapWahaType(t?: string): "text" | "image" | "video" | "audio" | "document" | "location" | "sticker" {
  switch (t) {
    case "chat": return "text";
    case "image": return "image";
    case "video": return "video";
    case "audio":
    case "ptt":
    case "voice": return "audio";
    case "document": return "document";
    case "location": return "location";
    case "sticker": return "sticker";
    default: return "text";
  }
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

  // === message | message.any: inbound inbox ingestion
  if (payload.event === "message" || payload.event === "message.any") {
    const p = payload.payload as {
      id?: string;
      from?: string;
      fromMe?: boolean;
      body?: string;
      type?: string;
      timestamp?: number;
      notifyName?: string;
      _data?: { key?: { remoteJidAlt?: string }; pushName?: string };
    };

    if (p.fromMe) return { ok: true }; // outbound echo
    const from = String(p.from ?? "");
    // skip groups, statuses, newsletters
    if (
      from === "status@broadcast" ||
      from.endsWith("@g.us") ||
      from.endsWith("@newsletter")
    ) {
      return { ok: true };
    }

    let waId = "";
    if (from.endsWith("@c.us")) {
      waId = from.slice(0, -"@c.us".length);
    } else if (from.endsWith("@lid")) {
      // LID addressing (privacy mode): real phone comes in _data.key.remoteJidAlt
      const alt = String(p._data?.key?.remoteJidAlt ?? "");
      waId = alt.includes("@") ? alt.split("@")[0] : from.slice(0, -"@lid".length);
    } else {
      return { ok: true }; // unknown addressing, skip
    }
    if (!waId) return { ok: true };

    // Dedupe: "message" and "message.any" both fire for the same inbound message
    if (p.id) {
      const { data: dup } = await admin
        .from("messages")
        .select("id")
        .eq("wa_message_id", p.id)
        .maybeSingle();
      if (dup) return { ok: true };
    }

    // Look up channel via session name
    const { data: channel } = await admin
      .from("channels")
      .select("id, organization_id, brand_id")
      .eq("session_name", sessionName)
      .maybeSingle();

    const orgId = (channel as { organization_id: string } | null)?.organization_id;
    const brandId = (channel as { brand_id: string | null } | null)?.brand_id;
    const channelId = (channel as { id: string } | null)?.id;

    if (!orgId || !channelId) return { ok: false, error: "channel not found for session" };
    if (!brandId) return { ok: false, error: "channel has no brand_id" };

    // 1. Upsert contact by unique (org, brand, wa_id)
    const { data: existingContact } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("brand_id", brandId)
      .eq("wa_id", waId)
      .maybeSingle();

    let contactRowId = (existingContact as { id?: string } | null)?.id;

    if (!contactRowId) {
      // billing gate on new contact
      const billing = await checkBillingFeature({
        organizationId: orgId,
        featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
        requestedUnits: 1,
        source: "webhook/waha/inbound-contact",
      });
      if (!billing.allowed) {
        console.warn("[billing] inbound WAHA contact over limit; preserving webhook", {
          organizationId: orgId, brandId, wa_id: waId,
        });
        // fall through — still insert the contact so we don't lose the message
      }
      const { data: inserted, error: insErr } = await admin
        .from("contacts")
        .insert({
          organization_id: orgId,
          brand_id: brandId,
          wa_id: waId,
          name: p.notifyName ?? p._data?.pushName ?? null,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) return { ok: false, error: `contact insert: ${insErr.message}` };
      contactRowId = (inserted as { id: string }).id;
    } else {
      // touch last_message_at + optionally refresh notifyName
      await admin
        .from("contacts")
        .update({
          last_message_at: new Date().toISOString(),
          ...(p.notifyName || p._data?.pushName
            ? { name: p.notifyName ?? p._data?.pushName }
            : {}),
        })
        .eq("id", contactRowId);
    }

    // 2. Upsert conversation by (org, brand, contact, channel_id)
    const { data: existingConvo } = await admin
      .from("conversations")
      .select("id, unread_count")
      .eq("organization_id", orgId)
      .eq("brand_id", brandId)
      .eq("contact_id", contactRowId)
      .eq("channel_id", channelId)
      .maybeSingle();

    let conversationId = (existingConvo as { id?: string } | null)?.id;
    const existingUnread = (existingConvo as { unread_count?: number } | null)?.unread_count ?? 0;

    if (!conversationId) {
      const { data: newConvo, error: cErr } = await admin
        .from("conversations")
        .insert({
          organization_id: orgId,
          brand_id: brandId,
          contact_id: contactRowId,
          channel_id: channelId,
          status: "open",
          priority: "medium",
          unread_count: 0,
        })
        .select("id")
        .single();
      if (cErr) return { ok: false, error: `conversation insert: ${cErr.message}` };
      conversationId = (newConvo as { id: string }).id;
    }

    // 3. Insert message
    const msgType = mapWahaType(p.type);
    const bodyText = typeof p.body === "string" ? p.body : "";
    const content =
      msgType === "text"
        ? { text: bodyText }
        : { text: bodyText || `[${msgType}]`, media_note: "media_not_downloaded" };

    const receivedAt = p.timestamp
      ? new Date(p.timestamp * 1000).toISOString()
      : new Date().toISOString();

    const { error: mErr } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        contact_id: contactRowId,
        direction: "inbound",
        type: msgType,
        content,
        wa_message_id: p.id ?? null,
        status: "delivered",
        is_bot: false,
        created_at: receivedAt,
      });
    if (mErr) return { ok: false, error: `message insert: ${mErr.message}` };

    // 4. Update conversation preview + unread_count
    const preview = (bodyText || `[${msgType}]`).slice(0, 100);
    await admin
      .from("conversations")
      .update({
        last_message_preview: preview,
        unread_count: existingUnread + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return { ok: true };
  }

  // === message.ack: update outbound message status
  if (payload.event === "message.ack") {
    const p = payload.payload as { id?: string; ack?: number };
    if (!p.id) return { ok: true };
    const status =
      p.ack === 0 ? "failed" :
      p.ack === 1 ? "sent" :
      p.ack === 2 ? "delivered" :
      p.ack === 3 || p.ack === 4 ? "read" :
      null;
    if (!status) return { ok: true };
    await admin
      .from("messages")
      .update({ status })
      .eq("wa_message_id", p.id);
    return { ok: true };
  }

  return { ok: true }; // unknown event, no-op
}
