/**
 * POST /api/broadcasts/v2/preview
 *   body: { clientId, audience, channelKind, waTemplateId? }
 *   → { counts, sample: [...], excluded: [...] } — cuántos recibirían la
 *     difusión y quiénes quedan fuera y por qué. Nada se envía.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { resolveAudience, EXCLUSION_LABELS, type ExclusionReason } from "@/lib/broadcasts/audience";

const schema = z.object({
  clientId: z.string().uuid(),
  channelKind: z.enum(["whatsapp_cloud", "waha"]),
  waTemplateId: z.string().uuid().optional(),
  audience: z
    .object({
      stages: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional(),
      createdFrom: z.string().optional(),
      createdTo: z.string().optional(),
      noReplyDays: z.number().int().min(1).max(365).optional(),
      excludeTemplateRecipients: z.boolean().optional(),
      contactIds: z.array(z.string().uuid()).optional(),
    })
    .default({}),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida", details: parsed.error.flatten() }, { status: 422 });
  const p = parsed.data;
  const access = await getCmClientAccess(request, p.clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  let templateName: string | null = null;
  if (p.waTemplateId) {
    const { data } = await supabaseAdmin.from("cm_wa_templates").select("name").eq("id", p.waTemplateId).eq("client_id", access.clientId).maybeSingle();
    templateName = (data?.name as string | undefined) || null;
  }

  const admin = createAdminClient("smarttalk");
  try {
    const result = await resolveAudience(admin, {
      orgId: access.organizationId,
      brandId: access.clientId,
      audience: p.audience,
      channelKind: p.channelKind,
      templateName,
      publicAdmin: supabaseAdmin,
    });
    return NextResponse.json({
      counts: result.counts,
      reasons: Object.fromEntries(
        Object.entries(result.counts.byReason).map(([k, v]) => [k, { count: v, label: EXCLUSION_LABELS[k as ExclusionReason] }])
      ),
      sample: result.included.slice(0, 12).map((c) => ({ id: c.id, name: c.name, phone: c.phone, stage: c.stage, source: c.source })),
      excluded: result.excluded.slice(0, 30).map((c) => ({ ...c, label: EXCLUSION_LABELS[c.reason] })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular la audiencia" }, { status: 500 });
  }
}
