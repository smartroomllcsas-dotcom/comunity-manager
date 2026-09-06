/**
 * POST /api/integrations/wa/send — API de integración server-to-server.
 * Permite a plataformas externas (ej. Doc Me Up Express) enviar plantillas WA
 * aprobadas de una marca CM sin sesión de usuario.
 *
 * Auth: header `X-Integration-Key` === env CM_INTEGRATION_API_KEY (si el env
 * no está seteado, el endpoint queda deshabilitado — fail-close).
 *
 * Body: {
 *   clientId: string,            // marca CM dueña de la cuenta WABA
 *   to: string,                  // E.164 sin '+' (ej. "573001234567")
 *   templateName: string,        // plantilla APPROVED de esa marca
 *   language?: string,           // default: language de la plantilla
 *   components?: unknown[]       // parámetros de la plantilla (formato Meta)
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getWabaClientForClient } from "@/lib/whatsapp/cloud/business-account";
import { friendlyWhatsAppError } from "@/lib/whatsapp/cloud/error-map";

export const runtime = "nodejs";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  to: z.string().regex(/^\d{8,15}$/, "to debe ser E.164 sin '+'"),
  templateName: z.string().min(1).max(512),
  language: z.string().min(2).max(10).optional(),
  components: z.array(z.unknown()).optional(),
});

function keyIsValid(request: NextRequest): boolean {
  const expected = process.env.CM_INTEGRATION_API_KEY;
  if (!expected) return false;
  const got = request.headers.get("x-integration-key") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!keyIsValid(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { clientId, to, templateName, language, components } = parsed.data;

  // Resolver la plantilla de la marca (debe estar APPROVED)
  let query = supabaseAdmin
    .from("cm_wa_templates")
    .select("id,whatsapp_account_id,name,language,status")
    .eq("client_id", clientId)
    .eq("name", templateName);
  if (language) query = query.eq("language", language);

  const { data: tpl, error: tplErr } = await query.limit(1).maybeSingle();
  if (tplErr) {
    console.error("[integrations/wa/send] db error", tplErr.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!tpl) {
    return NextResponse.json({ error: "Plantilla no encontrada para esta marca" }, { status: 404 });
  }
  if (tpl.status !== "APPROVED") {
    return NextResponse.json(
      { error: `La plantilla está en estado ${tpl.status}. Debe estar APPROVED.` },
      { status: 409 }
    );
  }

  let waba;
  try {
    waba = await getWabaClientForClient(clientId, tpl.whatsapp_account_id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cuenta WhatsApp no disponible" },
      { status: 409 }
    );
  }

  const { data: log } = await supabaseAdmin
    .from("cm_wa_template_sends")
    .insert({
      client_id: clientId,
      whatsapp_account_id: tpl.whatsapp_account_id,
      template_id: tpl.id,
      to_phone: to,
      template_name: tpl.name,
      language: tpl.language,
      status: "queued",
    })
    .select("id")
    .single();

  try {
    const resp = await waba.client.sendTemplateMessage({
      to,
      templateName: tpl.name,
      language: tpl.language,
      components,
    });
    const wamid = resp.messages?.[0]?.id ?? null;
    if (log?.id) {
      await supabaseAdmin
        .from("cm_wa_template_sends")
        .update({ wamid, status: "sent" })
        .eq("id", log.id);
    }
    return NextResponse.json({ ok: true, wamid, log_id: log?.id ?? null });
  } catch (err) {
    if (log?.id) {
      await supabaseAdmin
        .from("cm_wa_template_sends")
        .update({
          status: "failed",
          error: { message: err instanceof Error ? err.message : String(err) },
        })
        .eq("id", log.id);
    }
    return NextResponse.json(
      { error: friendlyWhatsAppError(err), log_id: log?.id ?? null },
      { status: 400 }
    );
  }
}
