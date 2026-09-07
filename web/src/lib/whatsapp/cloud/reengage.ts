/**
 * Retoma automática de conversaciones de WhatsApp.
 *
 * La configuración existía (reengage_template_id, reengage_after_hours en
 * cm_lead_agent_settings) pero ningún proceso la ejecutaba. Ahora, cada hora:
 * para cada marca con la retoma configurada, se buscan conversaciones de
 * WhatsApp oficial en las que el ÚLTIMO mensaje lo mandamos nosotros (el
 * cliente dejó de responder) hace más de N horas, y se le envía UNA vez la
 * plantilla de retoma. No se retoma a contactos en etapa Perdido ni Cliente.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { sendBrandTemplate } from "@/lib/whatsapp/cloud/lead-engagement";
import { addSystemNote } from "@/lib/smarttalk/internal-notes";

const MAX_AGE_DAYS = 14;
const PER_BRAND_LIMIT = 30;
const STOP_STAGES = ["perdido", "cliente", "descartado", "no interesado"];

type BrandConfig = {
  client_id: string;
  enabled: boolean;
  reengage_template_id: string | null;
  reengage_after_hours: number | null;
  max_sends_per_hour: number | null;
};

export async function runReengagement(now: Date = new Date()) {
  const { data: configs } = await supabaseAdmin
    .from("cm_lead_agent_settings")
    .select("client_id, enabled, reengage_template_id, reengage_after_hours, max_sends_per_hour")
    .eq("enabled", true)
    .not("reengage_template_id", "is", null);

  const admin = createAdminClient("smarttalk");
  let sent = 0;
  let considered = 0;
  const failures: string[] = [];

  for (const cfg of (configs || []) as BrandConfig[]) {
    const hours = Math.max(1, Number(cfg.reengage_after_hours) || 24);
    const cutoff = new Date(now.getTime() - hours * 3600_000).toISOString();
    const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 86400_000).toISOString();

    // Etapas que frenan la retoma (por nombre, en la org de la marca).
    const { data: brandRow } = await admin
      .from("channels")
      .select("organization_id")
      .eq("brand_id", cfg.client_id)
      .limit(1)
      .maybeSingle();
    const orgId = brandRow?.organization_id as string | undefined;
    const stopStageIds = new Set<string>();
    if (orgId) {
      const { data: stages } = await admin.from("lifecycle_stages").select("id, name").eq("organization_id", orgId);
      for (const s of stages || []) {
        if (STOP_STAGES.includes(String(s.name || "").toLowerCase())) stopStageIds.add(s.id as string);
      }
    }

    const { data: conversations } = await admin
      .from("conversations")
      .select("id, contact_id, updated_at, channel:channels!inner(type)")
      .eq("brand_id", cfg.client_id)
      .in("status", ["open", "pending"])
      .lt("updated_at", cutoff)
      .gt("updated_at", oldest)
      .in("channel.type", ["whatsapp_business_api", "whatsapp_cloud_api"])
      .order("updated_at", { ascending: false })
      .limit(PER_BRAND_LIMIT);

    let brandSent = 0;
    for (const conv of conversations || []) {
      considered += 1;
      const { data: last } = await admin
        .from("messages")
        .select("direction, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!last || last.direction !== "outbound" || String(last.created_at) > cutoff) continue;

      const { data: contact } = await admin
        .from("contacts")
        .select("id, name, wa_id, lifecycle_stage_id, custom_fields")
        .eq("id", conv.contact_id)
        .maybeSingle();
      if (!contact) continue;
      const cf = { ...((contact.custom_fields as Record<string, unknown> | null) || {}) };
      if (cf.wa_reengaged_at) continue;
      if (contact.lifecycle_stage_id && stopStageIds.has(contact.lifecycle_stage_id as string)) continue;
      if ((contact.custom_fields as Record<string, unknown> | null)?.do_not_contact === true) continue;
      if (typeof cf.cita_estado === "string" && cf.cita_estado === "agendada") continue; // ya agendó

      const phone = (typeof cf.phone === "string" && cf.phone) || (contact.wa_id as string | null) || "";
      if (!phone) continue;
      const firstName = String((typeof cf.nombre === "string" && cf.nombre) || contact.name || "").trim().split(/\s+/)[0] || "";
      const topic =
        (typeof cf.proyecto === "string" && cf.proyecto) ||
        (typeof cf.lead_campaign === "string" && cf.lead_campaign) ||
        "tu proyecto";

      const result = await sendBrandTemplate({
        clientId: cfg.client_id,
        templateId: cfg.reengage_template_id as string,
        phone,
        values: { nombre: /^[+\d@]/.test(firstName) ? "" : firstName, tema: topic },
        maxSendsPerHour: cfg.max_sends_per_hour ?? 20,
      });

      if (result.sent) {
        sent += 1;
        brandSent += 1;
        cf.wa_reengaged_at = now.toISOString();
        await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);
        await addSystemNote({
          conversationId: conv.id as string,
          organizationId: orgId || null,
          content: `🔁 Retoma automática: el cliente llevaba más de ${hours} h sin responder; se envió la plantilla de retoma.`,
          prefix: "[IA]",
        });
      } else {
        failures.push(`${conv.id}: ${result.reason}`);
        if (result.reason === "rate_limited") break;
      }
    }
    void brandSent;
  }

  return { brands: (configs || []).length, considered, sent, failures: failures.slice(0, 20) };
}
