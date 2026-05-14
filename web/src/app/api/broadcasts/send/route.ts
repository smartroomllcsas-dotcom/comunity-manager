import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplate, getOrgWhatsAppCredentials } from "@/lib/whatsapp/api";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase.from("agents").select("*").eq("id", user.id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { broadcastId } = await request.json();

  const { data: broadcast } = await admin.from("broadcasts").select("*, template:message_templates(*)").eq("id", broadcastId).eq("organization_id", agent.organization_id).single();
  if (!broadcast || !broadcast.template) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

  let contactQuery = admin.from("contacts").select("id, wa_id").eq("organization_id", agent.organization_id);
  const filter = broadcast.contact_filter as { tags?: string[] };
  if (filter.tags && filter.tags.length > 0) contactQuery = contactQuery.overlaps("tags", filter.tags);

  const { data: contacts } = await contactQuery;
  if (!contacts || contacts.length === 0) return NextResponse.json({ error: "No contacts found" }, { status: 400 });

  const recipients = contacts.map((c) => ({ broadcast_id: broadcastId, contact_id: c.id, status: "pending" as const }));
  await admin.from("broadcast_recipients").insert(recipients);

  // Verify channel belongs to this org if specified
  if (broadcast.channel_id) {
    const { data: channel } = await admin.from("channels").select("id").eq("id", broadcast.channel_id).eq("organization_id", agent.organization_id).single();
    if (!channel) return NextResponse.json({ error: "Channel not found or does not belong to this organization" }, { status: 403 });
  }

  const { phoneNumberId, accessToken } = await getOrgWhatsAppCredentials(agent.organization_id, broadcast.channel_id);

  let sentCount = 0, failedCount = 0;
  for (const contact of contacts) {
    try {
      await sendTemplate({ to: contact.wa_id, templateName: broadcast.template.name, language: broadcast.template.language, components: broadcast.template.components as unknown[], phoneNumberId, accessToken });
      await admin.from("broadcast_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("broadcast_id", broadcastId).eq("contact_id", contact.id);
      sentCount++;
    } catch {
      await admin.from("broadcast_recipients").update({ status: "failed" }).eq("broadcast_id", broadcastId).eq("contact_id", contact.id);
      failedCount++;
    }
  }

  await admin.from("broadcasts").update({ status: "completed", sent_count: sentCount, failed_count: failedCount }).eq("id", broadcastId);
  return NextResponse.json({ sent: sentCount, failed: failedCount });
}
