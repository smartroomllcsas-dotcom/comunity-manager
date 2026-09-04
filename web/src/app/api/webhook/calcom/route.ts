/**
 * Webhook de Cal.com → la plataforma se entera de las reuniones que agendan
 * los leads (el agente de IA comparte el enlace de agenda, pero hasta ahora
 * la reserva vivía sólo en Cal.com).
 *
 * Configuración en Cal.com → Settings → Developer → Webhooks:
 *   Subscriber URL: https://www.comunitymanager.io/api/webhook/calcom
 *   Secret:         el valor de CALCOM_WEBHOOK_SECRET
 *   Triggers:       BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
 *
 * Qué hace con cada reserva:
 *   1. Busca el contacto por teléfono (wa_id) y, si no, por correo.
 *   2. Guarda la cita en el contacto (custom_fields.cita_*) y en la
 *      conversación (metadata.booking) — el agente de IA la ve y deja de
 *      insistir con el enlace.
 *   3. Pasa el contacto a la etapa "Oportunidad" (sólo al crear).
 *   4. Deja una nota interna en la conversación y avisa por email al asesor
 *      asignado y al equipo asignado.
 *
 * Firma: cabecera `x-cal-signature-256` = HMAC-SHA256(cuerpo crudo, secret).
 * Best-effort: si el contacto no se encuentra responde 200 igual (Cal.com no
 * debe reintentar), pero lo deja en el log.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify/dispatcher";
import { addSystemNote } from "@/lib/smarttalk/internal-notes";

export const maxDuration = 60;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.comunitymanager.io").replace(/\/$/, "");
const DEFAULT_TZ = process.env.CALCOM_DEFAULT_TIMEZONE || "America/Bogota";

type CalPerson = { name?: string; email?: string; timeZone?: string; phoneNumber?: string };
type CalPayload = {
  uid?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  eventTypeId?: number;
  organizer?: CalPerson;
  attendees?: CalPerson[];
  responses?: Record<string, unknown>;
  location?: string;
  cancellationReason?: string;
  rescheduleUid?: string;
  rescheduleStartTime?: string;
};
type CalEvent = { triggerEvent?: string; createdAt?: string; payload?: CalPayload };

type BookingState = "agendada" | "reprogramada" | "cancelada";

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function digitsOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = value.replace(/[^\d]/g, "");
  return d.length >= 7 ? d : null;
}

/** Teléfono del asistente: Cal.com lo pone en distintos sitios según la ubicación elegida. */
function extractPhone(payload: CalPayload): string | null {
  const r = payload.responses || {};
  const location = r.location as { value?: string; optionValue?: string } | string | undefined;
  const candidates: unknown[] = [
    r.attendeePhoneNumber,
    r.phone,
    r.smsReminderNumber,
    typeof location === "object" ? location?.optionValue : null,
    typeof location === "string" ? location : null,
    payload.attendees?.[0]?.phoneNumber,
    payload.location,
  ];
  for (const c of candidates) {
    const d = digitsOf(c);
    if (d) return d;
  }
  return null;
}

function extractEmail(payload: CalPayload): string | null {
  const r = payload.responses || {};
  const fromResponses = typeof r.email === "string" ? r.email : null;
  const email = (payload.attendees?.[0]?.email || fromResponses || "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function formatWhen(iso: string | undefined, timeZone: string): string {
  if (!iso) return "fecha por confirmar";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeStyle: "short", timeZone }).format(d);
}

type ContactRow = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string | null;
  custom_fields: Record<string, unknown> | null;
  lifecycle_stage_id: string | null;
};

async function findContact(
  admin: ReturnType<typeof createAdminClient>,
  phone: string | null,
  email: string | null,
): Promise<{ contact: ContactRow; conversation: { id: string; assigned_agent_id: string | null; metadata: Record<string, unknown> | null } | null } | null> {
  const select = "id, organization_id, brand_id, name, custom_fields, lifecycle_stage_id";
  let candidates: ContactRow[] = [];

  if (phone) {
    const { data } = await admin
      .from("contacts")
      .select(select)
      .in("wa_id", [phone, `+${phone}`])
      .order("created_at", { ascending: false })
      .limit(10);
    candidates = (data || []) as ContactRow[];
  }
  if (candidates.length === 0 && email) {
    const { data } = await admin
      .from("contacts")
      .select(select)
      .or(`custom_fields->>correo.eq.${email},custom_fields->>email.eq.${email}`)
      .order("created_at", { ascending: false })
      .limit(10);
    candidates = (data || []) as ContactRow[];
  }
  if (candidates.length === 0) return null;

  // El mismo número puede existir en varias marcas: se prefiere el contacto
  // con la conversación más reciente (es con quien el agente habló).
  let best: { contact: ContactRow; conversation: { id: string; assigned_agent_id: string | null; metadata: Record<string, unknown> | null } | null; at: string } | null = null;
  for (const contact of candidates) {
    const { data: conv } = await admin
      .from("conversations")
      .select("id, assigned_agent_id, metadata, updated_at")
      .eq("contact_id", contact.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const at = (conv?.updated_at as string) || "";
    if (!best || at > best.at) {
      best = { contact, conversation: conv ? { id: conv.id as string, assigned_agent_id: conv.assigned_agent_id as string | null, metadata: (conv.metadata as Record<string, unknown>) || null } : null, at };
    }
  }
  return best ? { contact: best.contact, conversation: best.conversation } : null;
}

async function advisorEmails(
  admin: ReturnType<typeof createAdminClient>,
  conversation: { assigned_agent_id: string | null; metadata: Record<string, unknown> | null } | null,
): Promise<string[]> {
  const emails = new Set<string>();
  if (!conversation) return [];
  if (conversation.assigned_agent_id) {
    const { data: agent } = await admin
      .from("agents")
      .select("email")
      .eq("id", conversation.assigned_agent_id)
      .maybeSingle();
    if (agent?.email) emails.add(agent.email as string);
  }
  const teamId = conversation.metadata?.assigned_team_id;
  if (typeof teamId === "string" && teamId) {
    const { data: links } = await admin
      .from("agent_teams")
      .select("agent:agents(email)")
      .eq("team_id", teamId);
    for (const l of links || []) {
      const e = (l as { agent?: { email?: string } }).agent?.email;
      if (e) emails.add(e);
    }
  }
  return [...emails].filter((e) => e.includes("@"));
}

export async function POST(request: NextRequest) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[calcom-webhook] CALCOM_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ error: "webhook no configurado" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-cal-signature-256"), secret)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  let event: CalEvent;
  try {
    event = JSON.parse(rawBody) as CalEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const trigger = String(event.triggerEvent || "");
  const payload = event.payload || {};
  const stateByTrigger: Record<string, BookingState> = {
    BOOKING_CREATED: "agendada",
    BOOKING_RESCHEDULED: "reprogramada",
    BOOKING_CANCELLED: "cancelada",
  };
  const state = stateByTrigger[trigger];
  if (!state) return NextResponse.json({ ok: true, ignored: trigger });

  const phone = extractPhone(payload);
  const email = extractEmail(payload);
  const admin = createAdminClient("smarttalk");

  const match = await findContact(admin, phone, email);
  if (!match) {
    console.warn("[calcom-webhook] reserva sin contacto en la plataforma", {
      trigger,
      uid: payload.uid,
      has_phone: Boolean(phone),
      has_email: Boolean(email),
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  const { contact, conversation } = match;
  const timeZone = payload.attendees?.[0]?.timeZone || payload.organizer?.timeZone || DEFAULT_TZ;
  const whenText = formatWhen(payload.startTime, timeZone);
  const title = payload.title || "Reunión";

  // Idempotencia: Cal.com puede reintentar el mismo evento.
  const prev = (conversation?.metadata?.booking as { uid?: string; status?: string } | undefined) || undefined;
  if (prev?.uid === payload.uid && prev?.status === state && conversation) {
    return NextResponse.json({ ok: true, matched: true, duplicate: true });
  }

  const now = new Date().toISOString();
  const booking = {
    uid: payload.uid || null,
    status: state,
    title,
    start: payload.startTime || null,
    end: payload.endTime || null,
    when_text: whenText,
    time_zone: timeZone,
    updated_at: now,
  };

  // 1. Contacto: campos de la cita + etapa "Oportunidad" al agendar.
  const cf = { ...(contact.custom_fields || {}) };
  cf.cita_estado = state;
  cf.cita_titulo = title;
  cf.cita_inicio = payload.startTime || null;
  cf.cita_cuando = whenText;
  cf.cita_uid = payload.uid || null;
  if (state === "agendada") cf.cita_agendada_at = now;
  const contactPatch: Record<string, unknown> = { custom_fields: cf };
  if (state !== "cancelada") {
    const { data: stage } = await admin
      .from("lifecycle_stages")
      .select("id")
      .eq("organization_id", contact.organization_id)
      .ilike("name", "%oportunidad%")
      .limit(1)
      .maybeSingle();
    if (stage?.id) contactPatch.lifecycle_stage_id = stage.id;
  }
  await admin.from("contacts").update(contactPatch).eq("id", contact.id);

  // 2. Conversación: metadata.booking (lo lee el agente de IA) + nota interna.
  const noteByState: Record<BookingState, string> = {
    agendada: `📅 El cliente agendó una reunión por Cal.com: ${title} — ${whenText}.`,
    reprogramada: `📅 El cliente reprogramó la reunión: ${title} — ahora ${whenText}.`,
    cancelada: `❌ El cliente canceló la reunión ${title} (${whenText}).${payload.cancellationReason ? ` Motivo: ${payload.cancellationReason}` : ""}`,
  };
  const contactLine = [phone ? `Tel: +${phone}` : null, email ? `Correo: ${email}` : null]
    .filter(Boolean)
    .join(" · ");
  const note = `${noteByState[state]}${contactLine ? ` ${contactLine}.` : ""}`;

  if (conversation) {
    await admin
      .from("conversations")
      .update({ metadata: { ...(conversation.metadata || {}), booking }, updated_at: now })
      .eq("id", conversation.id);
    await addSystemNote({
      conversationId: conversation.id,
      organizationId: contact.organization_id,
      agentId: conversation.assigned_agent_id,
      content: note,
      prefix: "[Agenda]",
    });
  }

  // 3. Aviso al asesor / equipo (best-effort).
  try {
    const emails = await advisorEmails(admin, conversation);
    if (emails.length > 0) {
      const name = contact.name || "Un lead";
      const link = conversation ? `${APP_URL}/inbox?conversation=${conversation.id}` : `${APP_URL}/contacts`;
      const subjectByState: Record<BookingState, string> = {
        agendada: `📅 Reunión agendada: ${name} — ${whenText}`,
        reprogramada: `📅 Reunión reprogramada: ${name} — ${whenText}`,
        cancelada: `❌ Reunión cancelada: ${name}`,
      };
      const subject = subjectByState[state];
      const text = `${note} Abre la conversación: ${link}`;
      const html =
        `<p>${note}</p>` +
        `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Abrir conversación</a></p>`;
      await notify({
        organizationId: contact.organization_id,
        channels: ["email"],
        recipients: { email: emails },
        template: "custom",
        variables: { subject, text, html },
      });
    }
  } catch (e) {
    console.warn("[calcom-webhook] aviso al asesor falló (no crítico):", e);
  }

  return NextResponse.json({ ok: true, matched: true, state, contactId: contact.id });
}
