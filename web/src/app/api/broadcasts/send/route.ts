import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBrandPaused } from "@/lib/smarttalk/brand-lifecycle";
import { sendTemplate, getOrgWhatsAppCredentials } from "@/lib/whatsapp/api";
import {
  billingDeniedResponse,
  checkBillingFeature,
  recordBillingUsage,
} from "@/lib/billing/service";
import { BILLING_FEATURES } from "@/lib/billing/features";
import { rateLimit } from "@/lib/rate-limit";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";

// Sprint 22 hardening: 60 req/min por user para evitar spam de broadcasts.
const BROADCAST_RATE_LIMIT = 60;
const BROADCAST_RATE_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`broadcasts-send:${user.id}`, BROADCAST_RATE_LIMIT, BROADCAST_RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { data: agent } = await supabase.from("agents").select("*").eq("id", user.id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const assignedBrandIds = await getAgentBrandIds(agent);

  const { broadcastId } = await request.json();

  const { data: broadcast } = await admin.from("broadcasts").select("*, template:message_templates(*)").eq("id", broadcastId).eq("organization_id", agent.organization_id).single();
  if (!broadcast || !broadcast.template) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

  let channelBrandId: string | null = null;
  if (broadcast.channel_id) {
    const { data: channel } = await admin
      .from("channels")
      .select("id, brand_id")
      .eq("id", broadcast.channel_id)
      .eq("organization_id", agent.organization_id)
      .single();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found or does not belong to this organization" }, { status: 403 });
    }
    channelBrandId = channel.brand_id;
  }

  if (assignedBrandIds) {
    if (!channelBrandId || !assignedBrandIds.includes(channelBrandId)) {
      return NextResponse.json({ error: "No autorizado para enviar difusiones en esta marca" }, { status: 403 });
    }
  }

  const billingDecision = await checkBillingFeature({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.BROADCASTS_MONTH,
    requestedUnits: 1,
    source: "api/broadcasts/send",
  });
  if (!billingDecision.allowed) return billingDeniedResponse(billingDecision);

  let contactQuery = admin
    .from("contacts")
    .select("id, wa_id")
    .eq("organization_id", agent.organization_id);
  if (channelBrandId) contactQuery = contactQuery.eq("brand_id", channelBrandId);
  else if (assignedBrandIds) {
    contactQuery = contactQuery.in("brand_id", assignedBrandIds);
  }
  const filter = broadcast.contact_filter as { tags?: string[] };
  if (filter.tags && filter.tags.length > 0) contactQuery = contactQuery.overlaps("tags", filter.tags);

  const { data: contacts } = await contactQuery;
  if (!contacts || contacts.length === 0) return NextResponse.json({ error: "No contacts found" }, { status: 400 });

  const recipients = contacts.map((c) => ({ broadcast_id: broadcastId, contact_id: c.id, status: "pending" as const }));
  await admin.from("broadcast_recipients").insert(recipients);

  // Los broadcasts de una marca inactiva no salen. El broadcast conserva su
  // fila y sus destinatarios: se podrá enviar cuando la marca vuelva.
  if (channelBrandId && (await isBrandPaused(channelBrandId))) {
    return NextResponse.json(
      { error: "inactive_brand", message: "Esta marca está inactiva y no puede enviar difusiones." },
      { status: 409 },
    );
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
  await recordBillingUsage({
    organizationId: agent.organization_id,
    featureCode: BILLING_FEATURES.BROADCASTS_MONTH,
    quantity: 1,
    idempotencyKey: `broadcast:${broadcastId}`,
    sourceType: "broadcast",
    sourceId: broadcastId,
    periodStart: billingDecision.periodStart,
    periodEnd: billingDecision.periodEnd,
    metadata: { sent: sentCount, failed: failedCount },
  });
  return NextResponse.json({ sent: sentCount, failed: failedCount });
}
