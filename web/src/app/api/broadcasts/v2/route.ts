/**
 * Difusiones v2 — SIEMPRE por empresa (clientId = brand).
 *
 * GET  /api/broadcasts/v2?clientId=<uuid>
 *   → { broadcasts: [...], channels: [...], templates: [...] }
 * POST /api/broadcasts/v2
 *   body: { clientId, name, channelKind, channelId?, waTemplateId?, messageText?,
 *           variables?, audience?, scheduledAt?, sendRatePerHour?, startNow? }
 *   → crea la difusión, arma los destinatarios y la deja programada o en curso.
 *
 * Multi-tenant: getCmClientAccess() valida que el usuario pueda operar esa marca.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { prepareBroadcast, processBroadcasts } from "@/lib/broadcasts/engine";

export const maxDuration = 120;

const audienceSchema = z.object({
  stages: z.array(z.string().max(60)).max(20).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  sources: z.array(z.string().max(60)).max(10).optional(),
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  noReplyDays: z.number().int().min(1).max(365).optional(),
  excludeTemplateRecipients: z.boolean().optional(),
  contactIds: z.array(z.string().uuid()).max(2000).optional(),
});

const createSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(2).max(120),
  channelKind: z.enum(["whatsapp_cloud", "waha"]),
  channelId: z.string().uuid().optional(),
  waTemplateId: z.string().uuid().optional(),
  messageText: z.string().max(4000).optional(),
  variables: z.record(z.string(), z.string().max(500)).optional(),
  audience: audienceSchema.optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  sendRatePerHour: z.number().int().min(1).max(500).optional(),
  startNow: z.boolean().optional(),
});

async function loadBrandChannels(orgId: string, brandId: string) {
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("channels")
    .select("id, type, name, status, whatsapp_phone_number")
    .eq("organization_id", orgId)
    .eq("brand_id", brandId)
    .in("type", ["whatsapp_cloud_api", "whatsapp_business_api", "waha"]);
  return (data || []) as Array<{ id: string; type: string; name: string | null; status: string | null; whatsapp_phone_number: string | null }>;
}

async function loadBrandTemplates(brandId: string) {
  const { data } = await supabaseAdmin
    .from("cm_wa_templates")
    .select("id, name, language, category, status, components, parameter_format")
    .eq("client_id", brandId)
    .eq("status", "APPROVED")
    .order("name");
  return data || [];
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const admin = createAdminClient("smarttalk");
  const [{ data: broadcasts }, channels, templates, { data: stageRows }, { data: tagRows }] = await Promise.all([
    admin
      .from("broadcasts")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("brand_id", access.clientId)
      .order("created_at", { ascending: false })
      .limit(200),
    loadBrandChannels(access.organizationId, access.clientId),
    loadBrandTemplates(access.clientId),
    admin.from("lifecycle_stages").select("name, position").eq("organization_id", access.organizationId).order("position"),
    admin.from("contacts").select("tags").eq("brand_id", access.clientId).not("tags", "is", null).limit(3000),
  ]);
  const tagSet = new Set<string>();
  for (const r of (tagRows || []) as Array<{ tags: string[] | null }>) for (const t of r.tags || []) tagSet.add(t);
  const templateName = new Map((templates as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
  const channelName = new Map(channels.map((c) => [c.id, c.name || c.type]));
  return NextResponse.json({
    broadcasts: (broadcasts || []).map((b) => ({
      ...(b as Record<string, unknown>),
      template_name: templateName.get((b as { wa_template_id?: string }).wa_template_id || "") || null,
      channel_name: channelName.get((b as { channel_id?: string }).channel_id || "") || null,
    })),
    channels,
    templates,
    stages: ((stageRows || []) as Array<{ name: string }>).map((s) => s.name),
    tags: Array.from(tagSet).sort(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", details: parsed.error.flatten() }, { status: 422 });
  }
  const p = parsed.data;
  const access = await getCmClientAccess(request, p.clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  // Canal y plantilla deben ser de ESTA empresa.
  const channels = await loadBrandChannels(access.organizationId, access.clientId);
  let channelId = p.channelId || null;
  if (p.channelKind === "waha") {
    const ch = channels.find((c) => c.type === "waha" && (!channelId || c.id === channelId));
    if (!ch) return NextResponse.json({ error: "Esta empresa no tiene WhatsApp por QR conectado" }, { status: 422 });
    channelId = ch.id;
    if (!p.messageText?.trim()) return NextResponse.json({ error: "Escribe el texto del mensaje" }, { status: 422 });
  } else {
    const ch = channels.find((c) => c.type !== "waha" && (!channelId || c.id === channelId));
    if (!ch) return NextResponse.json({ error: "Esta empresa no tiene WhatsApp API conectado" }, { status: 422 });
    channelId = ch.id;
    if (!p.waTemplateId) return NextResponse.json({ error: "Elige una plantilla aprobada" }, { status: 422 });
    const { data: tpl } = await supabaseAdmin
      .from("cm_wa_templates")
      .select("id, status")
      .eq("id", p.waTemplateId)
      .eq("client_id", access.clientId)
      .maybeSingle();
    if (!tpl) return NextResponse.json({ error: "La plantilla no pertenece a esta empresa" }, { status: 422 });
    if (tpl.status !== "APPROVED") return NextResponse.json({ error: "La plantilla no está aprobada por Meta" }, { status: 422 });
  }

  const scheduled = p.scheduledAt ? new Date(p.scheduledAt) : null;
  const inFuture = scheduled && scheduled.getTime() > Date.now() + 60_000;
  const status = p.startNow || !inFuture ? "sending" : "scheduled";

  const admin = createAdminClient("smarttalk");
  const now = new Date().toISOString();
  const { data: created, error } = await admin
    .from("broadcasts")
    .insert({
      organization_id: access.organizationId,
      brand_id: access.clientId,
      name: p.name.trim(),
      channel_kind: p.channelKind,
      channel_id: channelId,
      wa_template_id: p.channelKind === "whatsapp_cloud" ? p.waTemplateId : null,
      message_text: p.channelKind === "waha" ? p.messageText : null,
      variables: p.variables || {},
      audience: p.audience || {},
      contact_filter: {},
      scheduled_at: status === "scheduled" ? scheduled!.toISOString() : now,
      send_rate_per_hour: p.sendRatePerHour || 20,
      status: "draft",
      created_by: access.cmUserId,
      started_at: status === "sending" ? now : null,
    })
    .select("id")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message || "No se pudo crear" }, { status: 500 });

  const prep = await prepareBroadcast(created.id as string);
  if (!prep.ok) {
    await admin.from("broadcasts").update({ status: "failed", last_error: prep.error }).eq("id", created.id);
    return NextResponse.json({ error: prep.error }, { status: 500 });
  }
  if (prep.included === 0) {
    await admin.from("broadcasts").update({ status: "completed", completed_at: now, last_error: "Nadie cumplía los filtros o todos estaban excluidos" }).eq("id", created.id);
    return NextResponse.json({ id: created.id, included: 0, skipped: prep.skipped, status: "completed" });
  }
  await admin.from("broadcasts").update({ status, updated_at: now }).eq("id", created.id);

  // Primera tanda de inmediato (sin esperar al cron) si arranca ya.
  if (status === "sending") {
    try {
      await processBroadcasts(60_000);
    } catch (e) {
      console.error("[broadcasts] primera tanda falló:", e);
    }
  }
  return NextResponse.json({ id: created.id, included: prep.included, skipped: prep.skipped, status });
}
