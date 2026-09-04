/**
 * Abordaje automático de leads por WhatsApp — usa la configuración por
 * empresa (cm_lead_agent_settings) para enviar la plantilla de primer
 * contacto al lead recién llegado de un formulario de Facebook.
 *
 * Contrato: BEST-EFFORT. Nunca lanza — la ingesta del lead jamás debe
 * fallar por un problema de WhatsApp. Todo resultado se reporta en el
 * retorno y se registra en cm_wa_template_sends + custom_fields.
 */
import { supabaseAdmin } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWabaCredentialsForClient } from "@/lib/whatsapp/cloud/business-account";
import { WabaCloudClient } from "@/lib/whatsapp/cloud/client";
import type { WaComponent } from "@/lib/whatsapp/cloud/types";

export interface LeadAgentSettings {
  id: string;
  client_id: string;
  enabled: boolean;
  first_touch_template_id: string | null;
  reengage_template_id: string | null;
  reengage_after_hours: number;
  agent_context: string | null;
  booking_url: string | null;
  max_sends_per_hour: number;
}

export async function getLeadAgentSettings(
  clientId: string
): Promise<LeadAgentSettings | null> {
  const { data } = await supabaseAdmin
    .from("cm_lead_agent_settings")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as LeadAgentSettings) ?? null;
}

/** Extrae los nombres de parámetros NAMED ({{nombre}}) del BODY, en orden. */
function bodyParamNames(components: WaComponent[]): string[] {
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return [];
  const names: string[] = [];
  for (const m of body.text.matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/** Variables posicionales {{1..n}} del BODY, en orden numérico. */
function bodyPositionalCount(components: WaComponent[]): number {
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return 0;
  const nums = new Set(
    [...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
  );
  return nums.size;
}

/** Texto del BODY con las variables ya reemplazadas, para mostrarlo en el chat. */
function renderBody(components: WaComponent[], values: Record<string, string>): string {
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return "";
  return body.text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Deja constancia del envío en la conversación del Inbox (mensaje saliente
 * tipo "template", como cuando un asesor la manda desde el chat). Sin esto el
 * asesor no ve que el lead ya recibió la plantilla y la vuelve a mandar.
 * Best-effort: nunca lanza.
 */
async function recordFirstTouchInInbox(input: {
  clientId: string;
  to: string;
  wamid: string | undefined;
  phoneNumberId: string;
  templateName: string;
  language: string;
  components: unknown[];
  renderedText: string;
}) {
  try {
    const admin = createAdminClient("smarttalk");

    const { data: contact } = await admin
      .from("contacts")
      .select("id, organization_id")
      .eq("brand_id", input.clientId)
      .in("wa_id", [input.to, `+${input.to}`])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!contact) return;

    const { data: channels } = await admin
      .from("channels")
      .select("id, organization_id, whatsapp_phone_number_id")
      .eq("brand_id", input.clientId)
      .in("type", ["whatsapp_business_api", "whatsapp_cloud_api"])
      .eq("status", "active");
    const channel =
      (channels || []).find((c) => c.whatsapp_phone_number_id === input.phoneNumberId) ||
      (channels || [])[0];
    if (!channel) return;

    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("channel_id", channel.id)
      .in("status", ["open", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId = existing?.id as string | undefined;
    if (!conversationId) {
      const { data: created } = await admin
        .from("conversations")
        .insert({
          organization_id: channel.organization_id,
          brand_id: input.clientId,
          contact_id: contact.id,
          channel_id: channel.id,
          status: "open",
        })
        .select("id")
        .single();
      conversationId = created?.id as string | undefined;
    }
    if (!conversationId) return;

    const now = new Date().toISOString();
    await admin.from("messages").insert({
      conversation_id: conversationId,
      contact_id: contact.id,
      direction: "outbound",
      type: "template",
      content: {
        type: "template",
        template_name: input.templateName,
        language: input.language,
        components: input.components,
        text: input.renderedText,
      },
      wa_message_id: input.wamid ?? null,
      status: "sent",
      is_bot: true,
    });
    await admin
      .from("conversations")
      .update({
        last_message_preview: `Plantilla: ${(input.renderedText || input.templateName).slice(0, 90)}`,
        updated_at: now,
      })
      .eq("id", conversationId);
  } catch (e) {
    console.warn("[lead-engagement] no se pudo registrar la plantilla en el Inbox:", e);
  }
}

export interface FirstTouchInput {
  clientId: string; // cm_clients.id (marca dueña del lead)
  phone: string; // E.164 con o sin '+'
  leadName?: string | null;
  topic?: string | null; // campaña / tema del formulario
}

export type FirstTouchResult =
  | { sent: true; wamid?: string; templateName: string }
  | { sent: false; reason: string };

/**
 * Envía la plantilla de primer contacto configurada para la marca.
 * Rellena variables: los nombres tipo "nombre" reciben el nombre del lead,
 * los tipo "tema"/"campaña" el topic; el resto usa el primer valor útil.
 */
export async function sendFirstTouchTemplate(
  input: FirstTouchInput
): Promise<FirstTouchResult> {
  try {
    const settings = await getLeadAgentSettings(input.clientId);
    if (!settings?.enabled) return { sent: false, reason: "disabled" };
    if (!settings.first_touch_template_id)
      return { sent: false, reason: "no_template_configured" };

    const { data: template } = await supabaseAdmin
      .from("cm_wa_templates")
      .select("id, whatsapp_account_id, name, language, status, components, parameter_format")
      .eq("id", settings.first_touch_template_id)
      .eq("client_id", input.clientId)
      .maybeSingle();
    if (!template) return { sent: false, reason: "template_not_found" };
    if (template.status !== "APPROVED")
      return { sent: false, reason: `template_${String(template.status).toLowerCase()}` };

    // Límite de seguridad por hora (por cuenta)
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("cm_wa_template_sends")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_account_id", template.whatsapp_account_id)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= settings.max_sends_per_hour)
      return { sent: false, reason: "rate_limited" };

    const to = input.phone.replace(/[^\d]/g, "");
    if (to.length < 7) return { sent: false, reason: "invalid_phone" };

    const creds = await getWabaCredentialsForClient(
      input.clientId,
      template.whatsapp_account_id
    );
    const client = new WabaCloudClient(
      creds.account.waba_id,
      creds.account.phone_number_id,
      creds.token
    );

    const components = (template.components ?? []) as WaComponent[];
    const firstName = (input.leadName || "").trim().split(/\s+/)[0] || "Hola";
    const topic = (input.topic || "").trim() || "tu proyecto";

    const valueFor = (name: string, index: number) => {
      const n = name.toLowerCase();
      if (/nombre|name/.test(n)) return firstName;
      if (/tema|topic|campa|proyecto|asunto/.test(n)) return topic;
      return index === 0 ? firstName : topic;
    };

    let sendComponents: unknown[] = [];
    const renderValues: Record<string, string> = {};
    if (template.parameter_format === "NAMED") {
      const names = bodyParamNames(components);
      if (names.length > 0) {
        sendComponents = [
          {
            type: "body",
            parameters: names.map((name, i) => {
              renderValues[name] = valueFor(name, i);
              return { type: "text", parameter_name: name, text: renderValues[name] };
            }),
          },
        ];
      }
    } else {
      const n = bodyPositionalCount(components);
      if (n > 0) {
        sendComponents = [
          {
            type: "body",
            parameters: Array.from({ length: n }, (_v, i) => {
              renderValues[String(i + 1)] = i === 0 ? firstName : topic;
              return { type: "text", text: renderValues[String(i + 1)] };
            }),
          },
        ];
      }
    }

    const resp = await client.sendTemplateMessage({
      to,
      templateName: template.name,
      language: template.language,
      components: sendComponents,
    });
    const wamid = (resp as { messages?: Array<{ id?: string }> }).messages?.[0]?.id;

    await supabaseAdmin.from("cm_wa_template_sends").insert({
      client_id: input.clientId,
      whatsapp_account_id: template.whatsapp_account_id,
      template_id: template.id,
      to_phone: to,
      template_name: template.name,
      language: template.language,
      wamid: wamid ?? null,
      status: "sent",
    });

    await recordFirstTouchInInbox({
      clientId: input.clientId,
      to,
      wamid,
      phoneNumberId: creds.account.phone_number_id,
      templateName: template.name,
      language: template.language,
      components: sendComponents,
      renderedText: renderBody(components, renderValues),
    });

    return { sent: true, wamid, templateName: template.name };
  } catch (e) {
    console.error("[lead-engagement] first touch failed:", e);
    return {
      sent: false,
      reason: e instanceof Error ? e.message.slice(0, 200) : "unknown_error",
    };
  }
}
