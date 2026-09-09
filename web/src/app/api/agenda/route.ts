/**
 * GET /api/agenda?clientId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → { meetings: [...], bookingUrl, calcomUrl }
 * Reuniones agendadas por Cal.com de los contactos de ESA empresa
 * (custom_fields.cita_*), para mostrarlas en el calendario del CRM.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";

export type AgendaMeeting = {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  when: string;
  startsAt: string;
  status: string;
  url: string | null;
  conversationId: string | null;
};

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  const access = await getCmClientAccess(request, clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const admin = createAdminClient("smarttalk");
  const [{ data: contacts }, { data: settings }] = await Promise.all([
    admin
      .from("contacts")
      .select("id, name, wa_id, custom_fields")
      .eq("brand_id", access.clientId)
      .not("custom_fields->>cita_inicio", "is", null)
      .limit(2000),
    supabaseAdmin.from("cm_lead_agent_settings").select("booking_url").eq("client_id", access.clientId).maybeSingle(),
  ]);

  const ids = ((contacts || []) as Array<{ id: string }>).map((c) => c.id);
  const convByContact = new Map<string, string>();
  if (ids.length) {
    const { data: convs } = await admin
      .from("conversations")
      .select("id, contact_id")
      .in("contact_id", ids)
      .order("updated_at", { ascending: false })
      .limit(5000);
    for (const c of (convs || []) as Array<{ id: string; contact_id: string }>) {
      if (!convByContact.has(c.contact_id)) convByContact.set(c.contact_id, c.id);
    }
  }

  const meetings: AgendaMeeting[] = ((contacts || []) as Array<{ id: string; name: string | null; wa_id: string | null; custom_fields: Record<string, unknown> | null }>)
    .map((c) => {
      const cf = c.custom_fields || {};
      const startsAt = String(cf.cita_inicio || "");
      if (!startsAt) return null;
      return {
        contactId: c.id,
        name: c.name || c.wa_id || "Sin nombre",
        phone: (typeof cf.cita_telefono === "string" && cf.cita_telefono) || c.wa_id || null,
        email: typeof cf.cita_correo === "string" ? cf.cita_correo : null,
        title: typeof cf.cita_titulo === "string" ? cf.cita_titulo : null,
        when: String(cf.cita_cuando || ""),
        startsAt,
        status: String(cf.cita_estado || "agendada"),
        url: typeof cf.cita_url === "string" ? cf.cita_url : null,
        conversationId: convByContact.get(c.id) || null,
      } as AgendaMeeting;
    })
    .filter((m): m is AgendaMeeting => Boolean(m))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const calcomBase = (process.env.CALCOM_BASE_URL?.trim() || "https://cal.smartgenapp.com").replace(/\/+$/, "");
  return NextResponse.json({
    meetings,
    bookingUrl: (settings?.booking_url as string | null) || null,
    calcomUrl: `${calcomBase}/bookings/upcoming`,
  });
}
