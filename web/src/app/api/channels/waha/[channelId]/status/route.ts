import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentCanAccessBrand } from "@/lib/smarttalk/brand-scope";
import { wahaFromEnv } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, member_type, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: channel } = await admin
    .from("channels")
    .select("id, organization_id, brand_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.organization_id !== agent.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (channel.brand_id && !(await agentCanAccessBrand(agent, channel.brand_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: sess } = await admin
    .from("waha_sessions")
    .select("session_name, status, phone_number, push_name, last_status_at, last_error")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let liveData: {
    status: string;
    me?: { id?: string; pushname?: string };
  } | null = null;

  try {
    liveData = await wahaFromEnv().getSession(sess.session_name);
  } catch {
    // Return DB row as-is on error
    return NextResponse.json({ ...sess, channelId: channelId });
  }

  const now = new Date().toISOString();
  const updates: Record<string, string | null> = {
    status: liveData.status,
    last_status_at: now,
    phone_number: liveData.me?.id?.split("@")[0] ?? null,
    push_name: liveData.me?.pushname ?? null,
  };

  await admin
    .from("waha_sessions")
    .update(updates)
    .eq("channel_id", channelId);

  if (liveData.status === "WORKING") {
    await admin
      .from("channels")
      .update({ status: "active", connected_at: now })
      .eq("id", channelId);
  }

  return NextResponse.json({
    channelId: channelId,
    session_name: sess.session_name,
    status: liveData.status,
    last_status_at: now,
    phone_number: updates.phone_number,
    push_name: updates.push_name,
    last_error: sess.last_error,
  });
}
