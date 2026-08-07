import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { wahaFromEnv } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, member_type")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: channel } = await admin
    .from("channels")
    .select("id, organization_id")
    .eq("id", params.channelId)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.organization_id !== agent.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: sess } = await admin
    .from("waha_sessions")
    .select("session_name")
    .eq("channel_id", params.channelId)
    .maybeSingle();

  if (sess?.session_name) {
    const client = wahaFromEnv();
    try { await client.logout(sess.session_name); } catch { /* best-effort */ }
    try { await client.deleteSession(sess.session_name); } catch { /* best-effort */ }
  }

  await admin
    .from("waha_sessions")
    .delete()
    .eq("channel_id", params.channelId);

  await admin
    .from("channels")
    .update({ status: "disconnected" })
    .eq("id", params.channelId);

  return NextResponse.json({ ok: true });
}
