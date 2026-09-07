/**
 * Recordatorio de reunión por WhatsApp.
 *
 * Cuando un lead agenda en Cal.com, el webhook guarda la cita en el contacto
 * (custom_fields.cita_*). Este módulo envía, N minutos antes (60 por
 * defecto), una plantilla aprobada de recordatorio, una sola vez por cita.
 *
 * Configuración por marca en `public.settings` (clave/valor JSON):
 *   lead_agent_booking_reminder:<brandId> → { enabled, template_id, minutes_before }
 *
 * La plantilla `recordatorio_reunion` (categoría UTILITY: Meta la entrega
 * también en países con marketing restringido) se crea sola en Meta la
 * primera vez si la marca no la tiene; queda PENDING hasta que Meta la apruebe.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getWabaClientForClient } from "@/lib/whatsapp/cloud/business-account";
import { sendBrandTemplate } from "@/lib/whatsapp/cloud/lead-engagement";
import { addSystemNote } from "@/lib/smarttalk/internal-notes";
import { formatBogota, REPLY_WINDOW_TZ } from "@/lib/inbox/reply-window";

export interface BookingReminderSettings {
  enabled: boolean;
  template_id: string | null;
  minutes_before: number;
}

export const REMINDER_TEMPLATE_NAME = "recordatorio_reunion";
const KEY_PREFIX = "lead_agent_booking_reminder:";
const DEFAULTS: BookingReminderSettings = { enabled: false, template_id: null, minutes_before: 60 };
// Ventana de disparo: el cron corre cada 5 min; se manda si el momento
// objetivo cayó en los últimos 10 min (y la reunión aún no empezó).
const FIRE_WINDOW_MS = 10 * 60_000;

function sanitize(input: unknown): BookingReminderSettings {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const minutes = Number(v.minutes_before);
  return {
    enabled: v.enabled === true,
    template_id: typeof v.template_id === "string" && v.template_id ? v.template_id : null,
    minutes_before: Number.isFinite(minutes) && minutes >= 5 && minutes <= 24 * 60 ? Math.round(minutes) : 60,
  };
}

export async function getBookingReminderSettings(brandId: string): Promise<BookingReminderSettings> {
  try {
    const pub = createAdminClient("public");
    const { data } = await pub.from("settings").select("value").eq("key", `${KEY_PREFIX}${brandId}`).maybeSingle();
    return data ? sanitize(data.value) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setBookingReminderSettings(
  brandId: string,
  input: unknown,
): Promise<{ ok: true; value: BookingReminderSettings } | { ok: false; error: string }> {
  const value = sanitize(input);
  const pub = createAdminClient("public");
  const { error } = await pub
    .from("settings")
    .upsert({ key: `${KEY_PREFIX}${brandId}`, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value };
}

/**
 * Marcas con el recordatorio activo. Si una marca lo activó sin plantilla,
 * se crea la plantilla en Meta aquí mismo (el servidor tiene las
 * credenciales) y queda seleccionada; se enviará cuando Meta la apruebe.
 */
async function listConfiguredBrands(): Promise<Array<{ brandId: string; settings: BookingReminderSettings }>> {
  const pub = createAdminClient("public");
  const { data } = await pub.from("settings").select("key, value").like("key", `${KEY_PREFIX}%`);
  const enabled = (data || [])
    .map((row) => ({ brandId: String(row.key).slice(KEY_PREFIX.length), settings: sanitize(row.value) }))
    .filter((b) => b.settings.enabled);

  const out: Array<{ brandId: string; settings: BookingReminderSettings }> = [];
  for (const b of enabled) {
    if (!b.settings.template_id) {
      const { data: brand } = await pub.from("cm_clients").select("name").eq("id", b.brandId).maybeSingle();
      const created = await ensureReminderTemplate(b.brandId, (brand?.name as string) || "nuestro equipo");
      if ("error" in created) {
        console.warn("[booking-reminder] no se pudo crear la plantilla", { brandId: b.brandId, error: created.error });
        continue;
      }
      b.settings.template_id = created.id;
      await setBookingReminderSettings(b.brandId, b.settings);
    }
    out.push(b);
  }
  return out;
}

/**
 * Crea en Meta la plantilla de recordatorio para la marca si no existe.
 * Devuelve la fila local (puede estar PENDING).
 */
export async function ensureReminderTemplate(
  brandId: string,
  brandName: string,
): Promise<{ id: string; status: string; created: boolean } | { error: string }> {
  const { data: existing } = await supabaseAdmin
    .from("cm_wa_templates")
    .select("id, status")
    .eq("client_id", brandId)
    .eq("name", REMINDER_TEMPLATE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id as string, status: existing.status as string, created: false };

  const { data: account } = await supabaseAdmin
    .from("cm_whatsapp_accounts")
    .select("id")
    .eq("client_id", brandId)
    .limit(1)
    .maybeSingle();
  if (!account) return { error: "La marca no tiene cuenta de WhatsApp conectada" };

  const components = [
    {
      type: "BODY",
      // Pide una respuesta: así el cliente reabre la ventana de 24 h y el
      // asesor o el agente pueden escribirle libremente aunque hayan pasado días.
      text:
        `Hola {{nombre}} 👋 Te recordamos tu reunión con ${brandName} {{cuando}}. ` +
        `Te contactaremos al número que dejaste al agendar. ` +
        `¿Confirmas que estarás? Responde SÍ para confirmar, o cuéntanos si prefieres reprogramar.`,
      example: {
        body_text_named_params: [
          { param_name: "nombre", example: "Ana" },
          { param_name: "cuando", example: "hoy a las 3:00 PM" },
        ],
      },
    },
    { type: "FOOTER", text: "Gracias por tu confianza" },
  ];

  try {
    const waba = await getWabaClientForClient(brandId, account.id as string);
    const metaResp = (await waba.client.createTemplate({
      name: REMINDER_TEMPLATE_NAME,
      language: "es_CO",
      category: "UTILITY",
      parameter_format: "NAMED",
      components: components as unknown as import("@/lib/whatsapp/cloud/types").WaComponent[],
    })) as { id?: string; status?: string; category?: string };
    const { data, error } = await supabaseAdmin
      .from("cm_wa_templates")
      .upsert(
        {
          client_id: brandId,
          whatsapp_account_id: account.id,
          meta_id: metaResp.id ?? null,
          name: REMINDER_TEMPLATE_NAME,
          language: "es_CO",
          category: metaResp.category ?? "UTILITY",
          status: metaResp.status ?? "PENDING",
          components,
          parameter_format: "NAMED",
          tag: "recordatorio-reunion",
          synced_at: new Date().toISOString(),
        },
        { onConflict: "whatsapp_account_id,name,language" },
      )
      .select("id, status")
      .single();
    if (error || !data) return { error: error?.message || "No se pudo guardar la plantilla" };
    return { id: data.id as string, status: data.status as string, created: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Meta rechazó la creación" };
  }
}

/** "hoy a las 3:00 PM" / "mañana a las 9:00 AM" / "el lunes, 8 de septiembre de 2026, 9:00 AM". */
export function describeWhen(start: Date, now: Date): string {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: REPLY_WINDOW_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("es-CO", { timeZone: REPLY_WINDOW_TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .format(start)
    .replace(/\s?a\.\s?m\./i, " AM")
    .replace(/\s?p\.\s?m\./i, " PM");
  const today = day(now);
  const tomorrow = day(new Date(now.getTime() + 86400_000));
  const d = day(start);
  if (d === today) return `hoy a las ${time}`;
  if (d === tomorrow) return `mañana a las ${time}`;
  return `el ${formatBogota(start)}`;
}

export async function runBookingReminders(now: Date = new Date()) {
  const admin = createAdminClient("smarttalk");
  const brands = await listConfiguredBrands();
  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const { brandId, settings } of brands) {
    const { data: contacts } = await admin
      .from("contacts")
      .select("id, name, wa_id, custom_fields")
      .eq("brand_id", brandId)
      .eq("custom_fields->>cita_estado", "agendada")
      .is("custom_fields->>cita_recordatorio_enviado_at", null)
      .not("custom_fields->>cita_inicio", "is", null)
      .limit(200);

    for (const c of contacts || []) {
      const cf = { ...((c.custom_fields as Record<string, unknown> | null) || {}) };
      const start = new Date(String(cf.cita_inicio));
      if (Number.isNaN(start.getTime()) || start <= now) continue;
      const fireAt = start.getTime() - settings.minutes_before * 60_000;
      if (fireAt > now.getTime() || fireAt < now.getTime() - FIRE_WINDOW_MS) continue;

      const phone =
        (typeof cf.cita_telefono === "string" && cf.cita_telefono) ||
        (typeof cf.phone === "string" && cf.phone) ||
        (c.wa_id as string | null) ||
        "";
      if (!phone) {
        skipped += 1;
        continue;
      }
      const firstName = String((typeof cf.nombre === "string" && cf.nombre) || c.name || "").trim().split(/\s+/)[0] || "";

      const result = await sendBrandTemplate({
        clientId: brandId,
        templateId: settings.template_id as string,
        phone,
        values: { nombre: /^[+\d@]/.test(firstName) ? "" : firstName, cuando: describeWhen(start, now) },
        skipRateLimit: true,
      });

      if (result.sent) {
        sent += 1;
        cf.cita_recordatorio_enviado_at = now.toISOString();
        await admin.from("contacts").update({ custom_fields: cf }).eq("id", c.id);
        const { data: conv } = await admin
          .from("conversations")
          .select("id, organization_id")
          .eq("contact_id", c.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (conv) {
          await addSystemNote({
            conversationId: conv.id as string,
            organizationId: conv.organization_id as string,
            content: `⏰ Recordatorio de reunión enviado por WhatsApp (${describeWhen(start, now)}).`,
            prefix: "[Agenda]",
          });
        }
      } else {
        failures.push(`${c.id}: ${result.reason}`);
        // Motivos permanentes (plantilla no aprobada aún) se reintentan en la
        // siguiente pasada mientras la ventana dure; no se marca nada.
      }
    }
  }

  return { brands: brands.length, sent, skipped, failures };
}
