/**
 * GET    /api/whatsapp/cloud/templates/[id]?clientId=<uuid>   — single
 * PATCH  /api/whatsapp/cloud/templates/[id]                    — edit (category o components)
 * DELETE /api/whatsapp/cloud/templates/[id]?clientId=<uuid>[&hard=1]  — delete
 *
 * PATCH sin category ni components → 400.
 * DELETE: por default borra sólo esa variante de idioma (hsm_id). Con hard=1
 * borra todas las traducciones del name en Meta.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { getWabaClientForClient } from "@/lib/whatsapp/cloud/business-account";
import { editTemplateSchema } from "@/lib/whatsapp/cloud/validators";
import { friendlyWhatsAppError } from "@/lib/whatsapp/cloud/error-map";

async function loadTemplate(clientId: string, templateId: string) {
  const { data, error } = await supabaseAdmin
    .from("cm_wa_templates")
    .select("*")
    .eq("id", templateId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as (Record<string, unknown> & { whatsapp_account_id: string; meta_id: string | null; name: string; language: string }) | null;
}

// -----------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tpl = await loadTemplate(access.clientId, id);
  if (!tpl) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  return NextResponse.json({ template: tpl });
}

// -----------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const clientId = (body as { clientId?: string }).clientId;
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const parsed = editTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const tpl = await loadTemplate(access.clientId, id);
  if (!tpl) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  if (!tpl.meta_id) {
    return NextResponse.json(
      { error: "La plantilla aún no tiene meta_id (sync pendiente)" },
      { status: 409 }
    );
  }

  const waba = await getWabaClientForClient(access.clientId, tpl.whatsapp_account_id);
  try {
    await waba.client.editTemplate(tpl.meta_id, parsed.data);
  } catch (err) {
    return NextResponse.json({ error: friendlyWhatsAppError(err) }, { status: 400 });
  }

  // Local: guardar patch + volver a PENDING si tocamos components
  const patch: Record<string, unknown> = { synced_at: new Date().toISOString() };
  if (parsed.data.category) {
    patch.previous_category = tpl.category as string;
    patch.category = parsed.data.category;
  }
  if (parsed.data.components) {
    patch.components = parsed.data.components;
    patch.status = "PENDING"; // Meta re-review
  }

  // Defensa en profundidad: doble filtro id+client_id aunque loadTemplate ya validó.
  const { data: updated, error } = await supabaseAdmin
    .from("cm_wa_templates")
    .update(patch)
    .eq("id", id)
    .eq("client_id", access.clientId)
    .select()
    .single();
  if (error) {
    console.error("[wa/cloud/templates PATCH] db error", error.message);
    return NextResponse.json({ error: "Error interno al actualizar. Reintenta." }, { status: 500 });
  }

  return NextResponse.json({ template: updated });
}

// -----------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clientId = request.nextUrl.searchParams.get("clientId");
  const hard = request.nextUrl.searchParams.get("hard") === "1";
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });

  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tpl = await loadTemplate(access.clientId, id);
  if (!tpl) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  const waba = await getWabaClientForClient(access.clientId, tpl.whatsapp_account_id);
  try {
    if (hard || !tpl.meta_id) {
      // borra todas las traducciones del name
      await waba.client.deleteTemplate(tpl.name);
    } else {
      await waba.client.deleteTemplate(tpl.name, tpl.meta_id);
    }
  } catch (err) {
    return NextResponse.json({ error: friendlyWhatsAppError(err) }, { status: 400 });
  }

  // Marcamos local como PENDING_DELETION; webhook confirmará. Doble filtro por defensa.
  await supabaseAdmin
    .from("cm_wa_templates")
    .update({ status: "PENDING_DELETION", synced_at: new Date().toISOString() })
    .eq("id", id)
    .eq("client_id", access.clientId);

  return NextResponse.json({ ok: true });
}
