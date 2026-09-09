/**
 * GET /api/agenda/contacts?clientId=<uuid>&q=<texto>
 *   → { contacts: [{ id, name, phone, email, stage }] } — búsqueda de contactos
 *     de ESA empresa para agendar una reunión.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCmClientAccess } from "@/lib/cm-client-access";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const admin = createAdminClient("smarttalk");
  let query = admin
    .from("contacts")
    .select("id, name, wa_id, custom_fields, lifecycle_stages(name)")
    .eq("brand_id", access.clientId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(15);
  if (q) {
    const digits = q.replace(/\D/g, "");
    query = digits.length >= 4 ? query.or(`name.ilike.%${q}%,wa_id.ilike.%${digits}%`) : query.ilike("name", `%${q}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    contacts: ((data || []) as Array<{ id: string; name: string | null; wa_id: string | null; custom_fields: Record<string, unknown> | null; lifecycle_stages: { name: string } | Array<{ name: string }> | null }>).map((c) => {
      const cf = c.custom_fields || {};
      const st = Array.isArray(c.lifecycle_stages) ? c.lifecycle_stages[0] : c.lifecycle_stages;
      return {
        id: c.id,
        name: c.name || c.wa_id || "Sin nombre",
        phone: c.wa_id && /^\d{8,13}$/.test(c.wa_id) ? `+${c.wa_id}` : null,
        email: (typeof cf.email === "string" && cf.email) || (typeof cf.correo === "string" && cf.correo) || null,
        stage: st?.name || null,
      };
    }),
  });
}
