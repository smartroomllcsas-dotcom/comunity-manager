/**
 * Aviso a los asesores cuando un lead de formulario NO se puede abordar por
 * WhatsApp y hay que contactarlo a mano (llamada o correo):
 *
 *   - la plantilla de primer contacto rebotó (número sin WhatsApp, país con
 *     restricción de marketing, etc.),
 *   - el teléfono del formulario es inválido,
 *   - el lead llegó sin teléfono.
 *
 * Destinatarios: los asesores asignados a la marca (brand_advisor_assignments)
 * y el asesor asignado a la conversación; si no hay ninguno, los
 * administradores de la organización. Se envía UNA vez por lead
 * (custom_fields.wa_first_touch_alerted_at) y deja nota en la conversación.
 *
 * Best-effort: nunca lanza.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify/dispatcher";
import { addSystemNote } from "@/lib/smarttalk/internal-notes";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.comunitymanager.io").replace(/\/$/, "");

export type ManualContactCause = "whatsapp_failed" | "invalid_phone" | "no_phone";

const CAUSE_TEXT: Record<ManualContactCause, string> = {
  whatsapp_failed: "WhatsApp no pudo entregar la plantilla de primer contacto",
  invalid_phone: "el teléfono que dejó en el formulario no es válido",
  no_phone: "el lead no dejó teléfono en el formulario",
};

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Correos de TODOS los asesores asignados a una empresa/marca. Regla de la
 * casa: cada asesor asignado a una empresa recibe los avisos de sus leads
 * (handoff, reunión agendada, contactar a mano…), esté o no en un equipo.
 */
export async function brandAdvisorEmails(admin: Admin, brandId: string | null): Promise<string[]> {
  if (!brandId) return [];
  const { data: assignments } = await admin
    .from("brand_advisor_assignments")
    .select("agent:agents!brand_advisor_assignments_agent_id_fkey(email)")
    .eq("brand_id", brandId);
  const emails = new Set<string>();
  for (const row of assignments || []) {
    const e = (row as { agent?: { email?: string } }).agent?.email;
    if (e && e.includes("@")) emails.add(e);
  }
  return [...emails];
}

/** Nombre de la empresa/marca (cm_clients) para que los avisos digan de quién es el lead. */
export async function brandName(brandId: string | null): Promise<string | null> {
  if (!brandId) return null;
  try {
    const pub = createAdminClient("public");
    const { data } = await pub.from("cm_clients").select("name").eq("id", brandId).maybeSingle();
    return (data?.name as string | null) || null;
  } catch {
    return null;
  }
}

async function recipientsFor(
  admin: Admin,
  organizationId: string,
  brandId: string,
  conversationAssignedAgentId: string | null,
): Promise<string[]> {
  const emails = new Set<string>(await brandAdvisorEmails(admin, brandId));

  if (conversationAssignedAgentId) {
    const { data: agent } = await admin
      .from("agents")
      .select("email")
      .eq("id", conversationAssignedAgentId)
      .maybeSingle();
    if (agent?.email) emails.add(agent.email as string);
  }

  if (emails.size === 0) {
    const { data: admins } = await admin
      .from("agents")
      .select("email")
      .eq("organization_id", organizationId)
      .eq("is_super_admin", true);
    for (const a of admins || []) if (a.email) emails.add(a.email as string);
  }

  return [...emails].filter((e) => e.includes("@"));
}

export async function notifyLeadNeedsManualContact(input: {
  contactId: string;
  brandId: string;
  cause: ManualContactCause;
  /** Detalle adicional (p. ej. el error de Meta). */
  detail?: string | null;
  conversationId?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const admin = createAdminClient("smarttalk");

    const { data: contact } = await admin
      .from("contacts")
      .select("id, organization_id, name, wa_id, custom_fields")
      .eq("id", input.contactId)
      .maybeSingle();
    if (!contact) return { sent: false, reason: "contacto_no_encontrado" };

    const cf = { ...((contact.custom_fields as Record<string, unknown> | null) || {}) };
    if (cf.wa_first_touch_alerted_at) return { sent: false, reason: "ya_avisado" };

    // Conversación (para el enlace al chat y el asesor asignado).
    let conversationId = input.conversationId || null;
    let assignedAgentId: string | null = null;
    const { data: conv } = conversationId
      ? await admin
          .from("conversations")
          .select("id, assigned_agent_id")
          .eq("id", conversationId)
          .maybeSingle()
      : await admin
          .from("conversations")
          .select("id, assigned_agent_id")
          .eq("contact_id", contact.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (conv) {
      conversationId = conv.id as string;
      assignedAgentId = (conv.assigned_agent_id as string | null) || null;
    }

    const organizationId = contact.organization_id as string;
    const emails = await recipientsFor(admin, organizationId, input.brandId, assignedAgentId);

    const name = (contact.name as string) || "Lead sin nombre";
    const phone =
      (typeof cf.phone === "string" && cf.phone) || (contact.wa_id as string | null) || null;
    const email = (typeof cf.email === "string" && cf.email) || null;
    const company = typeof cf.company_name === "string" ? cf.company_name : null;
    const campaign = typeof cf.lead_campaign === "string" ? cf.lead_campaign : null;

    const why = `${CAUSE_TEXT[input.cause]}${input.detail ? ` (${input.detail})` : ""}`;
    const contactLink = `${APP_URL}/contacts/${contact.id}`;
    const chatLink = conversationId ? `${APP_URL}/inbox?conversation=${conversationId}` : null;

    // Nota en la conversación para que quede en el historial del lead.
    if (conversationId) {
      await addSystemNote({
        conversationId,
        organizationId,
        content:
          `📞 Contactar a mano: ${why}. ` +
          `${phone ? `Tel: ${phone}. ` : ""}${email ? `Correo: ${email}. ` : ""}` +
          `Se avisó por email a: ${emails.join(", ") || "nadie (sin asesores)"}.`,
        prefix: "[Lead]",
      });
    }

    if (emails.length === 0) {
      console.warn("[lead-alerts] sin destinatarios", { contact_id: contact.id, brand_id: input.brandId });
      return { sent: false, reason: "sin_destinatarios" };
    }

    const brand = (await brandName(input.brandId)) || "tu empresa";
    const subject = `📞 [${brand}] Lead para contactar a mano: ${name}${company ? ` (${company})` : ""}`;
    const lines = [
      `Empresa: ${brand}`,
      `${name}${company ? ` · ${company}` : ""} llegó por formulario de Facebook${campaign ? ` (campaña ${campaign})` : ""}, pero ${why}.`,
      `Hay que contactarlo por llamada o correo:`,
      phone ? `• Teléfono: ${phone}` : `• Teléfono: no dejó`,
      email ? `• Correo: ${email}` : `• Correo: no dejó`,
      `Ficha del contacto: ${contactLink}`,
      chatLink ? `Conversación: ${chatLink}` : "",
    ].filter(Boolean);
    const text = lines.join("\n");
    const html =
      `<p style="color:#555">Empresa: <b>${brand}</b></p>` +
      `<p><b>${name}</b>${company ? ` · ${company}` : ""} llegó por formulario de Facebook${campaign ? ` (campaña ${campaign})` : ""}, pero <b>${why}</b>.</p>` +
      `<p>Hay que contactarlo por llamada o correo:</p>` +
      `<ul><li>Teléfono: ${phone ? `<a href="tel:${phone}">${phone}</a>` : "no dejó"}</li>` +
      `<li>Correo: ${email ? `<a href="mailto:${email}">${email}</a>` : "no dejó"}</li></ul>` +
      `<p><a href="${contactLink}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Ver ficha del contacto</a>` +
      (chatLink ? ` &nbsp; <a href="${chatLink}">Abrir conversación</a>` : "") +
      `</p>`;

    await notify({
      organizationId,
      channels: ["email"],
      recipients: { email: emails },
      template: "custom",
      variables: { subject, text, html },
    });

    cf.wa_first_touch_alerted_at = new Date().toISOString();
    cf.wa_first_touch_alert_to = emails.join(",");
    await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);

    return { sent: true };
  } catch (e) {
    console.warn("[lead-alerts] aviso falló (no crítico):", e);
    return { sent: false, reason: e instanceof Error ? e.message.slice(0, 120) : "error" };
  }
}
