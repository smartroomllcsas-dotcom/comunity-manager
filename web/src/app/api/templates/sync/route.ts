import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase.from("agents").select("organization_id").eq("id", user.id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let body: { channelId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body provided, fall back to default behavior
  }

  let wabaId: string | null = null;
  let accessToken: string | null = null;
  let channelId: string | null = body.channelId || null;

  if (channelId) {
    // Use specific channel's credentials
    const { data: channel } = await admin
      .from("channels")
      .select("whatsapp_business_account_id, access_token, organization_id")
      .eq("id", channelId)
      .eq("organization_id", agent.organization_id)
      .single();

    if (!channel) return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });
    if (!channel.whatsapp_business_account_id || !channel.access_token) {
      return NextResponse.json({ error: "Canal sin credenciales de WhatsApp" }, { status: 400 });
    }

    wabaId = channel.whatsapp_business_account_id;
    accessToken = channel.access_token;
  } else {
    // Fall back to org's first active WhatsApp channel
    const { data: channel } = await admin
      .from("channels")
      .select("id, whatsapp_business_account_id, access_token")
      .eq("organization_id", agent.organization_id)
      .in("type", ["whatsapp_business_api", "whatsapp_cloud_api"])
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (channel?.whatsapp_business_account_id && channel?.access_token) {
      wabaId = channel.whatsapp_business_account_id;
      accessToken = channel.access_token;
      channelId = channel.id;
    } else {
      // Legacy fallback: use org-level credentials
      const { data: org } = await admin
        .from("organizations")
        .select("whatsapp_business_account_id, access_token")
        .eq("id", agent.organization_id)
        .single();

      if (!org?.whatsapp_business_account_id || !org?.access_token) {
        return NextResponse.json({ error: "WhatsApp no configurado" }, { status: 400 });
      }

      wabaId = org.whatsapp_business_account_id;
      accessToken = org.access_token;
    }
  }

  const waApiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
  const response = await fetch(
    `https://graph.facebook.com/${waApiVersion}/${wabaId}/message_templates`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) return NextResponse.json({ error: "Error al obtener plantillas de Meta" }, { status: 500 });

  const { data: templates } = await response.json();
  let synced = 0;
  for (const t of templates || []) {
    await admin.from("message_templates").upsert({
      organization_id: agent.organization_id,
      wa_template_id: t.id,
      name: t.name,
      language: t.language,
      category: t.category?.toLowerCase() || "utility",
      components: t.components || [],
      status: t.status === "APPROVED" ? "approved" : t.status === "REJECTED" ? "rejected" : "pending",
      channel_id: channelId,
    }, { onConflict: "id" });
    synced++;
  }
  return NextResponse.json({ synced, channelId });
}
