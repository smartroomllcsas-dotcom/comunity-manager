/**
 * Seguimiento automático de leads, por empresa: varios intentos cuando el
 * cliente deja de responder, y cierre al final.
 *
 * Reemplaza la retoma única. Reglas:
 * - Aplica a chats de WhatsApp (API oficial o por QR) donde el ÚLTIMO mensaje
 *   es nuestro y el cliente lleva N horas sin escribir.
 * - Intento k sale cuando el silencio del cliente supera steps[k].after_hours.
 *   API oficial → plantilla (la del paso, o la de retoma de la empresa; Utility
 *   para EE. UU./Canadá o si Meta limita marketing). QR → texto del paso.
 * - Tras el último intento, si sigue callado `finish_after_hours` más, se
 *   marca Perdido, se deja nota y se avisa a los asesores por correo.
 * - Nunca a: Perdido/Cliente, "no contactar", con reunión agendada.
 *
 * Config en `public.settings` → `lead_agent_followup:<brandId>`; si no hay,
 * aplican los valores por defecto (3 intentos: 24 h, 72 h, 7 días).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { sendBrandTemplate } from "@/lib/whatsapp/cloud/lead-engagement";
import { addSystemNote } from "@/lib/smarttalk/internal-notes";

export type FollowupStep = {
  /** Horas de silencio del cliente para disparar este intento. */
  after_hours: number;
  /** Plantilla (WhatsApp API). null = plantilla de retoma de la empresa. */
  template_id: string | null;
  /** Texto (WhatsApp por QR). Admite {{contacto.nombre}}. */
  text: string;
};

export type FollowupSettings = {
  enabled: boolean;
  steps: FollowupStep[];
  /** Al terminar los intentos sin respuesta: marcar Perdido y avisar. */
  finish_mark_lost: boolean;
  /** Horas extra de silencio después del último intento antes de cerrar. */
  finish_after_hours: number;
  notify_advisors: boolean;
};

export const DEFAULT_FOLLOWUP_TEXTS = [
  "Hola {{contacto.nombre}} 👋 Hace un rato conversamos y quedé pendiente de ti. ¿Seguimos? Cuéntame en qué te ayudo.",
  "Hola {{contacto.nombre}}, no quiero ser insistente 🙂 Si aún te interesa, con gusto retomamos cuando me digas.",
  "Hola {{contacto.nombre}}, este es mi último mensaje por ahora para no molestarte. Si más adelante quieres retomar, aquí estaré. ¡Que estés muy bien! 🙌",
];

export const DEFAULT_FOLLOWUP: FollowupSettings = {
  enabled: true,
  steps: [
    { after_hours: 24, template_id: null, text: DEFAULT_FOLLOWUP_TEXTS[0] },
    { after_hours: 72, template_id: null, text: DEFAULT_FOLLOWUP_TEXTS[1] },
    { after_hours: 168, template_id: null, text: DEFAULT_FOLLOWUP_TEXTS[2] },
  ],
  finish_mark_lost: true,
  finish_after_hours: 48,
  notify_advisors: true,
};

const KEY_PREFIX = "lead_agent_followup:";
const MAX_AGE_DAYS = 30;
const PER_BRAND_LIMIT = 60;
const MIN_GAP_BETWEEN_ATTEMPTS_H = 12;
const STOP_STAGES = ["perdido", "cliente", "descartado", "no interesado", "no contactar", "baja"];

function sanitize(input: unknown): FollowupSettings {
  const d = DEFAULT_FOLLOWUP;
  if (!input || typeof input !== "object") return d;
  const o = input as Partial<FollowupSettings>;
  const stepsIn = Array.isArray(o.steps) ? o.steps : d.steps;
  const steps: FollowupStep[] = stepsIn
    .slice(0, 5)
    .map((s, i) => ({
      after_hours: Math.max(1, Math.min(24 * 60, Number((s as FollowupStep)?.after_hours) || d.steps[i]?.after_hours || 24 * (i + 1))),
      template_id: typeof (s as FollowupStep)?.template_id === "string" && (s as FollowupStep).template_id ? (s as FollowupStep).template_id : null,
      text: String((s as FollowupStep)?.text || DEFAULT_FOLLOWUP_TEXTS[Math.min(i, 2)]).slice(0, 1000),
    }))
    .sort((a, b) => a.after_hours - b.after_hours);
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
    steps: steps.length ? steps : d.steps,
    finish_mark_lost: typeof o.finish_mark_lost === "boolean" ? o.finish_mark_lost : d.finish_mark_lost,
    finish_after_hours: Math.max(0, Math.min(24 * 30, Number(o.finish_after_hours) || d.finish_after_hours)),
    notify_advisors: typeof o.notify_advisors === "boolean" ? o.notify_advisors : d.notify_advisors,
  };
}

export async function getFollowupSettings(brandId: string): Promise<FollowupSettings> {
  try {
    const { data } = await supabaseAdmin.from("settings").select("value").eq("key", `${KEY_PREFIX}${brandId}`).maybeSingle();
    return sanitize(data?.value);
  } catch {
    return DEFAULT_FOLLOWUP;
  }
}

export async function setFollowupSettings(brandId: string, value: unknown): Promise<{ ok: true; value: FollowupSettings } | { ok: false; error: string }> {
  const clean = sanitize(value);
  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key: `${KEY_PREFIX}${brandId}`, value: clean, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: clean };
}

function renderName(text: string, contact: { name: string | null; custom_fields: Record<string, unknown> }): string {
  const full = String(contact.custom_fields.full_name || contact.name || "").trim();
  const first = full.split(/\s+/)[0] || "";
  const safe = /^[+\d@]/.test(first) ? "" : first;
  return text.replace(/\{\{\s*contacto\.nombre\s*\}\}/gi, safe).replace(/\s{2,}/g, " ").replace(/^Hola\s*,/, "Hola,").trim();
}

type BrandRuntime = {
  brandId: string;
  orgId: string;
  settings: FollowupSettings;
  reengageTemplateId: string | null;
  maxPerHour: number;
  stopStageIds: Set<string>;
  lostStageId: string | null;
};

async function loadBrands(): Promise<BrandRuntime[]> {
  const admin = createAdminClient("smarttalk");
  const { data: channels } = await admin
    .from("channels")
    .select("brand_id, organization_id, type, status")
    .in("type", ["whatsapp_business_api", "whatsapp_cloud_api", "waha"])
    .not("brand_id", "is", null);
  const byBrand = new Map<string, string>();
  for (const c of (channels || []) as Array<{ brand_id: string; organization_id: string }>) byBrand.set(c.brand_id, c.organization_id);

  const out: BrandRuntime[] = [];
  const stagesByOrg = new Map<string, Array<{ id: string; name: string }>>();
  for (const [brandId, orgId] of byBrand) {
    const settings = await getFollowupSettings(brandId);
    if (!settings.enabled) continue;
    const { data: lead } = await supabaseAdmin
      .from("cm_lead_agent_settings")
      .select("reengage_template_id, max_sends_per_hour")
      .eq("client_id", brandId)
      .maybeSingle();
    if (!stagesByOrg.has(orgId)) {
      const { data: stages } = await admin.from("lifecycle_stages").select("id, name").eq("organization_id", orgId);
      stagesByOrg.set(orgId, (stages || []) as Array<{ id: string; name: string }>);
    }
    const stages = stagesByOrg.get(orgId) || [];
    out.push({
      brandId,
      orgId,
      settings,
      reengageTemplateId: (lead?.reengage_template_id as string | null) || null,
      maxPerHour: Number(lead?.max_sends_per_hour) || 20,
      stopStageIds: new Set(stages.filter((s) => STOP_STAGES.includes(String(s.name || "").toLowerCase())).map((s) => s.id)),
      lostStageId: stages.find((s) => String(s.name).toLowerCase() === "perdido")?.id || null,
    });
  }
  return out;
}

export type FollowupRunResult = { brands: number; considered: number; sent: number; closed: number; failures: string[] };

export async function runFollowups(now: Date = new Date()): Promise<FollowupRunResult> {
  const admin = createAdminClient("smarttalk");
  const brands = await loadBrands();
  const res: FollowupRunResult = { brands: brands.length, considered: 0, sent: 0, closed: 0, failures: [] };

  for (const b of brands) {
    const firstAfter = b.settings.steps[0]?.after_hours || 24;
    const cutoff = new Date(now.getTime() - firstAfter * 3600_000).toISOString();
    const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 86400_000).toISOString();
    const { data: conversations } = await admin
      .from("conversations")
      .select("id, contact_id, updated_at, channel_id, assigned_agent_id, metadata, channel:channels!inner(id, type)")
      .eq("brand_id", b.brandId)
      .in("status", ["open", "pending"])
      .lt("updated_at", cutoff)
      .gt("updated_at", oldest)
      .in("channel.type", ["whatsapp_business_api", "whatsapp_cloud_api", "waha"])
      .order("updated_at", { ascending: false })
      .limit(PER_BRAND_LIMIT);

    let brandSent = 0;
    for (const conv of (conversations || []) as Array<{
      id: string; contact_id: string; channel_id: string; assigned_agent_id: string | null;
      metadata: Record<string, unknown> | null; channel: { type: string } | Array<{ type: string }>;
    }>) {
      if (brandSent >= b.maxPerHour) break;
      res.considered += 1;
      // Un asesor tiene el chat (asignado, bot en pausa): la automatización no se mete.
      if (conv.assigned_agent_id || conv.metadata?.ai_paused === true) continue;
      const chType = (Array.isArray(conv.channel) ? conv.channel[0] : conv.channel)?.type || "";
      const isQr = chType === "waha";

      const { data: lastMsgs } = await admin
        .from("messages")
        .select("direction, created_at, is_bot, content")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const msgs = (lastMsgs || []) as Array<{ direction: string; created_at: string; is_bot: boolean | null; content: { text?: string } | null }>;
      if (!msgs.length || msgs[0].direction !== "outbound") continue;
      // Si lo último lo escribió una persona, o hay nota interna humana
      // reciente, el asesor está atendiendo: no hay seguimiento automático.
      const { lastOutboundIsHuman, humanRepliedRecently } = await import("@/lib/chatbot/human-active");
      if (lastOutboundIsHuman(msgs)) continue;
      if (await humanRepliedRecently(admin, conv.id, 24 * 7)) continue;
      const lastInbound = msgs.find((m) => m.direction === "inbound");
      const silenceStart = lastInbound ? new Date(lastInbound.created_at) : new Date(msgs[msgs.length - 1].created_at);
      const hoursSilent = (now.getTime() - silenceStart.getTime()) / 3600_000;

      const { data: contact } = await admin
        .from("contacts")
        .select("id, name, wa_id, lifecycle_stage_id, custom_fields, visibility_status")
        .eq("id", conv.contact_id)
        .maybeSingle();
      if (!contact || contact.visibility_status === "restricted") continue;
      const cf = { ...((contact.custom_fields as Record<string, unknown> | null) || {}) };
      if (contact.lifecycle_stage_id && b.stopStageIds.has(contact.lifecycle_stage_id as string)) continue;
      if (cf.do_not_contact === true) continue;
      // Un asesor detuvo el seguimiento de este cliente desde la ficha o el chat.
      if (cf.wa_followup_stopped === true) continue;
      if (cf.cita_estado === "agendada") continue;

      const attempts = Number(cf.wa_followup_step ?? (cf.wa_reengaged_at ? 1 : 0)) || 0;
      const steps = b.settings.steps;
      const lastAttemptAt = typeof cf.wa_followup_last_at === "string" ? new Date(cf.wa_followup_last_at) : cf.wa_reengaged_at ? new Date(String(cf.wa_reengaged_at)) : null;
      const hoursSinceAttempt = lastAttemptAt ? (now.getTime() - lastAttemptAt.getTime()) / 3600_000 : Infinity;

      // ¿Toca cerrar?
      if (attempts >= steps.length) {
        if (!b.settings.finish_mark_lost || cf.wa_followup_finished_at) continue;
        const lastStep = steps[steps.length - 1];
        if (hoursSilent < lastStep.after_hours + b.settings.finish_after_hours) continue;
        cf.wa_followup_finished_at = now.toISOString();
        await admin
          .from("contacts")
          .update({ custom_fields: cf, ...(b.lostStageId ? { lifecycle_stage_id: b.lostStageId } : {}) })
          .eq("id", contact.id);
        await addSystemNote({
          conversationId: conv.id,
          organizationId: b.orgId,
          content: `Seguimiento terminado: ${steps.length} intentos sin respuesta. Se marcó como Perdido.`,
          prefix: "[IA]",
        });
        if (b.settings.notify_advisors) await notifyAdvisorsLost(b, contact.id, contact.name as string | null, conv.id, steps.length);
        res.closed += 1;
        continue;
      }

      // ¿Toca el siguiente intento?
      const step = steps[attempts];
      if (hoursSilent < step.after_hours) continue;
      if (attempts > 0 && hoursSinceAttempt < MIN_GAP_BETWEEN_ATTEMPTS_H) continue;

      const phone = String(cf.phone || contact.wa_id || "").replace(/\D/g, "");
      if (!/^\d{8,13}$/.test(phone)) continue;
      const contactForText = { name: contact.name as string | null, custom_fields: cf };

      try {
        let ok = false;
        let detail = "";
        if (isQr) {
          const text = renderName(step.text || DEFAULT_FOLLOWUP_TEXTS[Math.min(attempts, 2)], contactForText);
          const { sendWahaText } = await import("@/lib/waha/sender");
          const { wahaFromEnv } = await import("@/lib/waha/client");
          const { externalId } = await sendWahaText({ admin, channelId: conv.channel_id, toPhone: phone, text, client: wahaFromEnv() });
          await admin.from("messages").insert({
            conversation_id: conv.id,
            contact_id: contact.id,
            direction: "outbound",
            type: "text",
            content: { type: "text", text },
            wa_message_id: externalId || null,
            status: "sent",
            is_bot: true,
          });
          await admin.from("conversations").update({ last_message_preview: text.slice(0, 100), updated_at: now.toISOString() }).eq("id", conv.id);
          ok = true;
          detail = "mensaje por WhatsApp QR";
        } else {
          const templateId = step.template_id || b.reengageTemplateId;
          if (!templateId) {
            res.failures.push(`${b.brandId.slice(0, 8)}: sin plantilla de retoma configurada`);
            break;
          }
          const first = String(cf.nombre || contact.name || "").trim().split(/\s+/)[0] || "";
          const values = {
            nombre: /^[+\d@]/.test(first) ? "" : first,
            tema: String(cf.proyecto || cf.lead_campaign || "tu proyecto"),
          };
          const { getFirstTouchUtilitySettings, phoneNeedsUtility, isMarketingRestrictedError } = await import("@/lib/whatsapp/cloud/first-touch-utility");
          const utility = await getFirstTouchUtilitySettings(b.brandId);
          const utilityReady = Boolean(utility.enabled && utility.template_id);
          let result = utilityReady && phoneNeedsUtility(phone, utility.country_codes)
            ? await sendBrandTemplate({ clientId: b.brandId, templateId: utility.template_id as string, phone, values, skipRateLimit: true })
            : await sendBrandTemplate({ clientId: b.brandId, templateId, phone, values, skipRateLimit: true });
          if (!result.sent && utilityReady && isMarketingRestrictedError(result.reason)) {
            result = await sendBrandTemplate({ clientId: b.brandId, templateId: utility.template_id as string, phone, values, skipRateLimit: true });
          }
          ok = result.sent;
          detail = result.sent ? `plantilla ${result.templateName}` : result.reason;
          if (!result.sent && /^template_|template_not_found|credenciales|token/i.test(result.reason)) {
            res.failures.push(`${b.brandId.slice(0, 8)}: ${result.reason}`);
            break;
          }
        }

        if (ok) {
          cf.wa_followup_step = attempts + 1;
          cf.wa_followup_last_at = now.toISOString();
          cf.wa_reengaged_at = cf.wa_reengaged_at || now.toISOString();
          await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);
          await addSystemNote({
            conversationId: conv.id,
            organizationId: b.orgId,
            content: `🔁 Seguimiento automático ${attempts + 1} de ${steps.length}: el cliente llevaba ${Math.round(hoursSilent)} h sin responder; se envió ${detail}.`,
            prefix: "[IA]",
          });
          res.sent += 1;
          brandSent += 1;
        } else {
          res.failures.push(`${conv.id.slice(0, 8)}: ${detail}`);
        }
      } catch (e) {
        res.failures.push(`${conv.id.slice(0, 8)}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  }
  res.failures = res.failures.slice(0, 30);
  return res;
}

async function notifyAdvisorsLost(b: BrandRuntime, contactId: string, name: string | null, conversationId: string, attempts: number) {
  try {
    const { brandAdvisorEmails, brandName } = await import("@/lib/smarttalk/lead-alerts");
    const { notify } = await import("@/lib/notify/dispatcher");
    const admin = createAdminClient("smarttalk");
    const emails = await brandAdvisorEmails(admin, b.brandId);
    if (!emails.length) return;
    const brand = (await brandName(b.brandId)) || "tu empresa";
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.comunitymanager.io").replace(/\/$/, "");
    const who = name || "Un lead";
    const subject = `⏹ [${brand}] ${who} no respondió tras ${attempts} intentos — quedó en Perdido`;
    const text = `Empresa: ${brand}\n${who} no contestó a ${attempts} mensajes de seguimiento automático y se marcó como Perdido. Si quieres intentarlo por otro medio: ${appUrl}/contacts/${contactId}`;
    const html =
      `<p style="color:#555">Empresa: <b>${brand}</b></p>` +
      `<p><b>${who}</b> no contestó a ${attempts} mensajes de seguimiento automático y se marcó como <b>Perdido</b>.</p>` +
      `<p><a href="${appUrl}/contacts/${contactId}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Ver ficha</a> ` +
      `<a href="${appUrl}/inbox?conversation=${conversationId}" style="margin-left:8px">Abrir chat</a></p>`;
    await notify({ organizationId: b.orgId, channels: ["email"], recipients: { email: emails }, template: "custom", variables: { subject, text, html } });
  } catch (e) {
    console.warn("[followup] aviso a asesores falló:", e);
  }
}
