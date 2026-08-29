/**
 * GET  /api/whatsapp/cloud/business-accounts?clientId=<uuid>
 *   Lista cuentas WABA visibles para una marca. Reusa cm_whatsapp_accounts
 *   (mismo storage que WAHA channel) filtrando por client_id.
 *
 * Nunca devuelve credenciales (misma política que /api/whatsapp/accounts).
 * Multi-tenant enforced via getCmClientAccess() — mismo rail que las escrituras
 * WhatsApp existentes.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";

const PUBLIC_COLUMNS =
  "id,client_id,waba_id,phone_number_id,display_phone_number,verified_name,connected_at";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  const access = await getCmClientAccess(request, clientId);
  if (!access) {
    return NextResponse.json({ error: "No autorizado para esta marca" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("cm_whatsapp_accounts")
    .select(PUBLIC_COLUMNS)
    .eq("client_id", access.clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}
