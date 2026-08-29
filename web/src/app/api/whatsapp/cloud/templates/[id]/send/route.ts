/**
 * POST /api/whatsapp/cloud/templates/[id]/send
 *   body: { clientId, to, components? }
 *   Envía la plantilla al número `to` (E.164 sin '+').
 *   Registra en cm_wa_template_sends. Webhook messages.status actualizará delivery.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { getWabaClientForClient } from "@/lib/whatsapp/cloud/business-account";
import { sendTemplateSchema } from "@/lib/whatsapp/cloud/validators";
import { friendlyWhatsAppError } from "@/lib/whatsapp/cloud/error-map";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const clientId = (body as { clientId?: string }).clientId;
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const parsed = sendTemplateSchema.safeParse({ ...body, template_id: templateId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from("cm_wa_templates")
    .select("id,whatsapp_account_id,name,language,status")
    .eq("id", templateId)
    .eq("client_id", access.clientId)
    .maybeSingle();

  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
  if (!tpl) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  if (tpl.status !== "APPROVED") {
    return NextResponse.json(
      { error: `La plantilla está en estado ${tpl.status}. Debe estar APPROVED para enviar.` },
      { status: 409 }
    );
  }

  const waba = await getWabaClientForClient(access.clientId, tpl.whatsapp_account_id);

  // Log send como queued
  const { data: log } = await supabaseAdmin
    .from("cm_wa_template_sends")
    .insert({
      client_id: access.clientId,
      whatsapp_account_id: tpl.whatsapp_account_id,
      template_id: tpl.id,
      to_phone: parsed.data.to,
      template_name: tpl.name,
      language: tpl.language,
      status: "queued",
      sent_by_cm_user_id: access.cmUserId,
    })
    .select("id")
    .single();

  try {
    const resp = await waba.client.sendTemplateMessage({
      to: parsed.data.to,
      templateName: tpl.name,
      language: tpl.language,
      components: parsed.data.components,
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
          error: {
            message: err instanceof Error ? err.message : String(err),
          },
        })
        .eq("id", log.id);
    }
    return NextResponse.json(
      { error: friendlyWhatsAppError(err), log_id: log?.id ?? null },
      { status: 400 }
    );
  }
}
