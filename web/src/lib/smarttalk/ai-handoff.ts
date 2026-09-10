/**
 * Handoff del agente de IA a un humano.
 *
 * Cuando el bot escala (el cliente pide un humano, el agente califica al lead
 * con [ESCALATE], o se alcanza el tope de turnos), la conversación queda con
 * `metadata.ai_paused = true` — el bot NO vuelve a responder en esa
 * conversación (antes el contador se reseteaba a 0 y el bot retomaba en el
 * siguiente mensaje: por eso respondía decenas de veces a un spammer). Aquí
 * se avisa por email a los asesores de la marca y queda nota en el historial.
 *
 * Best-effort: nunca lanza.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify/dispatcher";
import { addSystemNote } from "@/lib/smarttalk/internal-notes";
import { brandAdvisorEmails, brandName } from "@/lib/smarttalk/lead-alerts";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.comunitymanager.io").replace(/\/$/, "");

export type AIHandoffReason = "escalation_keyword" | "escalate_marker" | "max_turns";

const REASON_TEXT: Record<AIHandoffReason, string> = {
  escalation_keyword: "el cliente pidió hablar con una persona",
  escalate_marker: "el agente de IA calificó al lead y lo pasó a un humano",
  max_turns: "la conversación llegó al tope de turnos del bot sin resolverse",
};

export async function notifyAIHandoff(input: {
  conversationId: string;
  organizationId: string;
  reason: AIHandoffReason;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select("brand_id, contact_id, assigned_agent_id")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!conv) return;

    const emails = new Set<string>(
      await brandAdvisorEmails(admin, (conv.brand_id as string | null) || null)
    );
    if (conv.assigned_agent_id) {
      const { data: agent } = await admin
        .from("agents")
        .select("email")
        .eq("id", conv.assigned_agent_id)
        .maybeSingle();
      if (agent?.email) emails.add(agent.email as string);
    }
    if (emails.size === 0) {
      const { data: admins } = await admin
        .from("agents")
        .select("email")
        .eq("organization_id", input.organizationId)
        .eq("is_super_admin", true);
      for (const a of admins || []) if (a.email) emails.add(a.email as string);
    }
    const recipients = [...emails].filter((e) => e.includes("@"));

    let name = "Lead sin nombre";
    let phone: string | null = null;
    if (conv.contact_id) {
      const { data: contact } = await admin
        .from("contacts")
        .select("name, wa_id, custom_fields")
        .eq("id", conv.contact_id)
        .maybeSingle();
      const cf = (contact?.custom_fields as Record<string, unknown> | null) || {};
      name = (typeof cf.nombre === "string" && cf.nombre) || (contact?.name as string | null) || name;
      phone = (typeof cf.phone === "string" && cf.phone) || (contact?.wa_id as string | null) || null;
    }

    const brand = (await brandName((conv.brand_id as string | null) || null)) || "tu empresa";
    const why = REASON_TEXT[input.reason];
    const chatLink = `${APP_URL}/inbox?conversation=${input.conversationId}`;

    await addSystemNote({
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      content:
        `🤝 Bot en pausa para esta conversación: ${why}. ` +
        `Un humano debe continuar el chat. ` +
        `Se avisó por email a: ${recipients.join(", ") || "nadie (sin asesores)"}.`,
      prefix: "[IA]",
    });

    if (recipients.length === 0) {
      console.warn("[ai-handoff] sin destinatarios", { conversation_id: input.conversationId });
      return;
    }

    const subject = `🤝 [${brand}] Lead esperando a un humano: ${name}`;
    const text = [
      `Empresa: ${brand}`,
      `${name}${phone ? ` (${phone})` : ""}: ${why}.`,
      `El bot dejó de responder esta conversación — retómala tú:`,
      chatLink,
    ].join("\n");
    const html =
      `<p style="color:#555">Empresa: <b>${brand}</b></p>` +
      `<p><b>${name}</b>${phone ? ` · <a href="tel:${phone}">${phone}</a>` : ""}: <b>${why}</b>.</p>` +
      `<p>El bot dejó de responder esta conversación. Un asesor debe continuar el chat.</p>` +
      `<p><a href="${chatLink}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Abrir conversación</a></p>`;

    await notify({
      organizationId: input.organizationId,
      channels: ["email"],
      recipients: { email: recipients },
      template: "custom",
      variables: { subject, text, html },
    });
  } catch (e) {
    console.warn("[ai-handoff] aviso falló (no crítico):", e);
  }
}
