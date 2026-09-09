/**
 * GET /api/agenda?clientId=<uuid>
 *   → { meetings: [...], bookingUrl, calcomUrl }
 * Reuniones (Cal.com o manuales) de los contactos de ESA empresa
 * (custom_fields.cita_*), para mostrarlas en el calendario del CRM.
 *
 * POST /api/agenda
 *   body: { clientId, contactId, startsAt (ISO), durationMin?, title?, note? }
 *   → registra una reunión manual en la ficha del contacto (misma forma que
 *     las de Cal.com, así el recordatorio por WhatsApp y la Home la ven igual).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { z } from "zod";

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

const createSchema = z.object({
  clientId: z.string().uuid(),
  contactId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(5).max(480).optional(),
  title: z.string().max(160).optional(),
  note: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validación fallida", details: parsed.error.flatten() }, { status: 422 });
  const p = parsed.data;
  const access = await getCmClientAccess(request, p.clientId);
  if (!access?.organizationId) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  const admin = createAdminClient("smarttalk");
  const { data: contact } = await admin
    .from("contacts")
    .select("id, name, wa_id, custom_fields")
    .eq("id", p.contactId)
    .eq("brand_id", access.clientId)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "El contacto no pertenece a esta empresa" }, { status: 404 });

  const start = new Date(p.startsAt);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Fecha inválida" }, { status: 422 });
  const cf = { ...((contact.custom_fields as Record<string, unknown> | null) || {}) };
  const whenText = start.toLocaleString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Bogota",
  });
  const title = p.title?.trim() || `Reunión con ${contact.name || contact.wa_id || "cliente"}`;
  Object.assign(cf, {
    cita_uid: `manual-${Date.now()}`,
    cita_origen: "manual",
    cita_estado: "agendada",
    cita_inicio: start.toISOString(),
    cita_duracion_min: p.durationMin || 30,
    cita_cuando: whenText,
    cita_titulo: title,
    cita_telefono: contact.wa_id && /^\d{8,13}$/.test(contact.wa_id) ? `+${contact.wa_id}` : cf.cita_telefono || null,
    cita_correo: cf.email || cf.correo || cf.cita_correo || null,
    cita_url: null,
    cita_agendada_at: new Date().toISOString(),
    cita_recordatorio_enviado_at: null,
    ...(p.note ? { cita_nota: p.note.trim() } : {}),
  });
  const { error } = await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nota en el chat (best-effort) para que el equipo lo vea.
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("contact_id", contact.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conv?.id) {
      const { addSystemNote } = await import("@/lib/smarttalk/internal-notes");
      await addSystemNote({
        conversationId: conv.id as string,
        organizationId: access.organizationId,
        content: `Reunión agendada manualmente: ${whenText}${p.note ? ` — ${p.note.trim()}` : ""}`,
        prefix: "[Agenda]",
      });
    }
  } catch {
    // sin nota no pasa nada
  }

  // Aviso por correo a TODOS los asesores de la empresa (igual que las reservas de Cal.com).
  let notified = 0;
  try {
    const { brandAdvisorEmails, brandName } = await import("@/lib/smarttalk/lead-alerts");
    const { notify } = await import("@/lib/notify/dispatcher");
    const emails = await brandAdvisorEmails(admin, access.clientId);
    if (emails.length > 0) {
      const brand = (await brandName(access.clientId)) || "tu empresa";
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.comunitymanager.io").replace(/\/$/, "");
      const name = contact.name || "Un cliente";
      const link = `${appUrl}/contacts/${contact.id}`;
      const detail = `${name} tiene reunión ${whenText} (${p.durationMin || 30} min)${p.note ? `. Nota: ${p.note.trim()}` : ""}.`;
      const subject = `📅 [${brand}] Reunión agendada manualmente: ${name} — ${whenText}`;
      const text = `Empresa: ${brand}\n${detail} Abre la ficha: ${link}`;
      const html =
        `<p style="color:#555">Empresa: <b>${brand}</b></p>` +
        `<p>${detail}</p>` +
        `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Abrir ficha del contacto</a></p>`;
      await notify({
        organizationId: access.organizationId,
        channels: ["email"],
        recipients: { email: emails },
        template: "custom",
        variables: { subject, text, html },
      });
      notified = emails.length;
    }
  } catch (e) {
    console.warn("[agenda] aviso a asesores falló (no crítico):", e);
  }
  return NextResponse.json({ ok: true, when: whenText, notified });
}
