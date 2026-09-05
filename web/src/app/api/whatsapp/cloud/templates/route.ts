/**
 * GET  /api/whatsapp/cloud/templates?clientId=<uuid>&accountId=<uuid?>
 *      &status=APPROVED,PENDING&category=MARKETING&search=text
 *   Lista plantillas cache local (cm_wa_templates) filtradas.
 *
 * POST /api/whatsapp/cloud/templates
 *   body: { clientId, whatsapp_account_id, name, language, category, components, parameter_format?, tag? }
 *   Crea plantilla en Meta + persiste local con status=PENDING.
 *
 * Ambas rutas validan acceso multi-tenant via getCmClientAccess().
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { getWabaClientForClient } from "@/lib/whatsapp/cloud/business-account";
import { createTemplateSchema } from "@/lib/whatsapp/cloud/validators";
import { friendlyWhatsAppError } from "@/lib/whatsapp/cloud/error-map";

// -----------------------------------------------------------------------------
// GET — list
// -----------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  const access = await getCmClientAccess(request, clientId);
  if (!access) {
    return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });
  }

  let query = supabaseAdmin
    .from("cm_wa_templates")
    .select(
      "id,client_id,whatsapp_account_id,meta_id,name,language,category,status,quality,components,parameter_format,rejection_reason,previous_category,tag,synced_at,created_at,updated_at"
    )
    .eq("client_id", access.clientId)
    .order("updated_at", { ascending: false });

  const accountId = params.get("accountId");
  if (accountId) query = query.eq("whatsapp_account_id", accountId);

  const status = params.get("status");
  if (status) {
    const list = status.split(",").map((s) => s.trim().toUpperCase());
    query = query.in("status", list);
  }

  const category = params.get("category");
  if (category) query = query.eq("category", category.toUpperCase());

  const search = params.get("search")?.trim();
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[wa/cloud/templates GET] db error", error.message);
    return NextResponse.json({ error: "Error interno cargando plantillas." }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

// -----------------------------------------------------------------------------
// POST — create
// -----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const clientId = (body as { clientId?: string }).clientId;
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  const access = await getCmClientAccess(request, clientId);
  if (!access) {
    return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });
  }

  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const payload = parsed.data;

  // Instanciamos client Meta con las creds de esa cuenta
  let waba;
  try {
    waba = await getWabaClientForClient(access.clientId, payload.whatsapp_account_id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Ownership del account debe coincidir con el client
  if (waba.account.client_id !== access.clientId) {
    return NextResponse.json({ error: "La cuenta no pertenece a esta marca" }, { status: 403 });
  }

  // Meta create
  let metaResp;
  try {
    metaResp = await waba.client.createTemplate({
      name: payload.name,
      language: payload.language,
      category: payload.category,
      parameter_format: payload.parameter_format,
      components: payload.components,
    });
  } catch (err) {
    return NextResponse.json(
      { error: friendlyWhatsAppError(err), raw: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  // Persistir local (upsert por unique (account, name, language))
  const { data, error } = await supabaseAdmin
    .from("cm_wa_templates")
    .upsert(
      {
        client_id: access.clientId,
        whatsapp_account_id: payload.whatsapp_account_id,
        meta_id: metaResp.id,
        name: payload.name,
        language: payload.language,
        category: metaResp.category ?? payload.category,
        status: metaResp.status ?? "PENDING",
        components: payload.components,
        parameter_format: payload.parameter_format,
        tag: payload.tag ?? null,
        created_by_cm_user_id: access.cmUserId,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "whatsapp_account_id,name,language" }
    )
    .select()
    .single();

  if (error) {
    console.error("[wa/cloud/templates POST] persist failed after Meta create", error.message);
    return NextResponse.json(
      {
        error: "La plantilla se creó en Meta pero no pudimos guardarla localmente.",
        warning: "Corre 'Sincronizar con Meta' para reconciliar.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ template: data }, { status: 201 });
}
