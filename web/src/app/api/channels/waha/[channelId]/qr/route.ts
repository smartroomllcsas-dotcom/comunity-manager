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
    .select("session_name, status")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (sess.status === "WORKING") {
    return NextResponse.json({ error: "session already connected" }, { status: 409 });
  }

  let qr: { mimetype: string; data: string };
  try {
    qr = await wahaFromEnv().getQr(sess.session_name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await admin
    .from("waha_sessions")
    .update({ last_qr_at: new Date().toISOString() })
    .eq("channel_id", channelId);

  return new NextResponse(Buffer.from(qr.data, "base64"), {
    status: 200,
    headers: {
      "Content-Type": qr.mimetype,
      "Cache-Control": "no-store",
    },
  });
}
