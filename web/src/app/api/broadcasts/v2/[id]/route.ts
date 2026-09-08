/**
 * GET  /api/broadcasts/v2/[id]?clientId=  → detalle + destinatarios (de esa empresa).
 * POST /api/broadcasts/v2/[id]            → acciones: { clientId, action }
 *   action: "start" | "pause" | "resume" | "cancel" | "retry_failed"
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { processBroadcasts, refreshCounters } from "@/lib/broadcasts/engine";
import { EXCLUSION_LABELS, type ExclusionReason } from "@/lib/broadcasts/audience";

async function loadOwned(request: NextRequest, id: string, clientId: string | null) {
  if (!clientId) return { error: NextResponse.json({ error: "clientId requerido" }, { status: 400 }) };
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) return { error: NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 }) };
  const admin = createAdminClient("smarttalk");
  const { data } = await admin
    .from("broadcasts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .eq("brand_id", access.clientId)
    .maybeSingle();
  if (!data) return { error: NextResponse.json({ error: "Difusión no encontrada en esta empresa" }, { status: 404 }) };
  return { admin, access, broadcast: data as Record<string, unknown> & { id: string; status: string } };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owned = await loadOwned(request, id, request.nextUrl.searchParams.get("clientId"));
  if ("error" in owned) return owned.error;
  const { admin, broadcast } = owned;

  const { data: recipients } = await admin
    .from("broadcast_recipients")
    .select("id, status, sent_at, delivered_at, read_at, replied_at, error, skipped_reason, conversation_id, contacts(id, name, wa_id)")
    .eq("broadcast_id", id)
    .order("status", { ascending: true })
    .limit(2000);
  return NextResponse.json({
    broadcast,
    recipients: (recipients || []).map((r) => {
      const rr = r as unknown as Record<string, unknown> & {
        contacts?: { id: string; name: string | null; wa_id: string | null } | Array<{ id: string; name: string | null; wa_id: string | null }> | null;
        skipped_reason?: string | null;
      };
      return {
        ...rr,
        contact: (Array.isArray(rr.contacts) ? rr.contacts[0] : rr.contacts) || null,
        skipped_label: rr.skipped_reason ? EXCLUSION_LABELS[rr.skipped_reason as ExclusionReason] || rr.skipped_reason : null,
      };
    }),
  });
}

const actionSchema = z.object({
  clientId: z.string().uuid(),
  action: z.enum(["start", "pause", "resume", "cancel", "retry_failed"]),
});

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  const owned = await loadOwned(request, id, parsed.data.clientId);
  if ("error" in owned) return owned.error;
  const { admin, broadcast } = owned;
  const now = new Date().toISOString();
  const { action } = parsed.data;

  if (action === "cancel") {
    await admin.from("broadcasts").update({ status: "cancelled", completed_at: now, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, status: "cancelled" });
  }
  if (action === "pause") {
    if (broadcast.status !== "sending" && broadcast.status !== "scheduled") return NextResponse.json({ error: "Sólo se pausa una difusión en curso o programada" }, { status: 409 });
    await admin.from("broadcasts").update({ status: "paused", updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, status: "paused" });
  }
  if (action === "start" || action === "resume") {
    if (!["draft", "scheduled", "paused"].includes(broadcast.status)) return NextResponse.json({ error: "Esta difusión no se puede iniciar" }, { status: 409 });
    await admin.from("broadcasts").update({ status: "sending", started_at: (broadcast.started_at as string | null) || now, last_error: null, updated_at: now }).eq("id", id);
    try {
      await processBroadcasts(60_000);
    } catch (e) {
      console.error("[broadcasts] tanda inmediata falló:", e);
    }
    await refreshCounters(id);
    return NextResponse.json({ ok: true, status: "sending" });
  }
  // retry_failed: los fallidos temporales vuelven a pendiente
  const { count } = await admin
    .from("broadcast_recipients")
    .update({ status: "pending", error: null }, { count: "exact" })
    .eq("broadcast_id", id)
    .eq("status", "failed")
    .not("error", "ilike", "%131049%")
    .not("error", "ilike", "%131026%");
  await admin.from("broadcasts").update({ status: "sending", last_error: null, updated_at: now }).eq("id", id);
  await refreshCounters(id);
  return NextResponse.json({ ok: true, retried: count ?? 0, status: "sending" });
}
