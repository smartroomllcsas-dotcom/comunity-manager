/**
 * Primer contacto en categoría UTILITY, para leads de países donde Meta no
 * entrega plantillas de MARKETING (Estados Unidos y Canadá, prefijo +1).
 *
 * Meta acepta como Utility un mensaje que confirma algo que el cliente pidió
 * — aquí, la solicitud del formulario — sin promoción. Se usa:
 *   - siempre, para números cuyo prefijo esté en `country_codes` (por defecto ["1"]);
 *   - como reintento, si Meta rechaza la de marketing por restricción.
 *
 * Configuración por marca en `public.settings`:
 *   lead_agent_first_touch_utility:<brandId> → { enabled, template_id, country_codes }
 * La plantilla `confirmacion_solicitud_lead` se crea sola en Meta la primera vez.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getWabaClientForClient } from "@/lib/whatsapp/cloud/business-account";

export interface FirstTouchUtilitySettings {
  enabled: boolean;
  template_id: string | null;
  /** Prefijos telefónicos (sin +) que usan la plantilla Utility de entrada. */
  country_codes: string[];
}

export const UTILITY_FIRST_TOUCH_TEMPLATE_NAME = "confirmacion_solicitud_lead";
const KEY_PREFIX = "lead_agent_first_touch_utility:";
const DEFAULT_CODES = ["1"];

function sanitize(input: unknown): FirstTouchUtilitySettings {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const codes = Array.isArray(v.country_codes)
    ? v.country_codes.map((c) => String(c).replace(/[^\d]/g, "")).filter(Boolean)
    : DEFAULT_CODES;
  return {
    enabled: v.enabled === true,
    template_id: typeof v.template_id === "string" && v.template_id ? v.template_id : null,
    country_codes: codes.length ? codes : DEFAULT_CODES,
  };
}

export async function getFirstTouchUtilitySettings(brandId: string): Promise<FirstTouchUtilitySettings> {
  try {
    const pub = createAdminClient("public");
    const { data } = await pub.from("settings").select("value").eq("key", `${KEY_PREFIX}${brandId}`).maybeSingle();
    return data ? sanitize(data.value) : sanitize({});
  } catch {
    return sanitize({});
  }
}

export async function setFirstTouchUtilitySettings(
  brandId: string,
  input: unknown,
): Promise<{ ok: true; value: FirstTouchUtilitySettings } | { ok: false; error: string }> {
  const value = sanitize(input);
  const pub = createAdminClient("public");
  const { error } = await pub
    .from("settings")
    .upsert({ key: `${KEY_PREFIX}${brandId}`, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value };
}

/** ¿El número (dígitos) pertenece a un país que requiere la plantilla Utility? */
export function phoneNeedsUtility(phoneDigits: string, codes: string[]): boolean {
  const d = phoneDigits.replace(/[^\d]/g, "");
  return codes.some((c) => d.startsWith(c));
}

/** Errores de Meta por restricción de marketing (EE. UU., experimentos, límites). */
export function isMarketingRestrictedError(reason: string | undefined): boolean {
  return /131049|131050|130472|marketing/i.test(reason || "");
}

export async function ensureUtilityFirstTouchTemplate(
  brandId: string,
  brandName: string,
): Promise<{ id: string; status: string; created: boolean } | { error: string }> {
  const { data: existing } = await supabaseAdmin
    .from("cm_wa_templates")
    .select("id, status")
    .eq("client_id", brandId)
    .eq("name", UTILITY_FIRST_TOUCH_TEMPLATE_NAME)
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

  // Texto estrictamente de confirmación (sin promoción) para que Meta lo
  // clasifique como Utility.
  const components = [
    {
      type: "BODY",
      text:
        `Hola {{nombre}} 👋 Confirmamos que recibimos tu solicitud en nuestro formulario sobre {{tema}}. ` +
        `Un asesor de ${brandName} la está revisando. ¿Prefieres que te contactemos por aquí o por correo? ` +
        `Responde a este mensaje y seguimos.`,
      example: {
        body_text_named_params: [
          { param_name: "nombre", example: "Ana" },
          { param_name: "tema", example: "tu página web" },
        ],
      },
    },
    { type: "FOOTER", text: "Si no enviaste esta solicitud, ignora este mensaje." },
  ];

  try {
    const waba = await getWabaClientForClient(brandId, account.id as string);
    const metaResp = (await waba.client.createTemplate({
      name: UTILITY_FIRST_TOUCH_TEMPLATE_NAME,
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
          name: UTILITY_FIRST_TOUCH_TEMPLATE_NAME,
          language: "es_CO",
          category: metaResp.category ?? "UTILITY",
          status: metaResp.status ?? "PENDING",
          components,
          parameter_format: "NAMED",
          tag: "lead-primer-contacto-utility",
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

/** Para el cron: marcas con la opción activa pero sin plantilla → se crea en Meta. */
export async function ensureUtilityFirstTouchTemplates(): Promise<{ created: number; errors: string[] }> {
  const pub = createAdminClient("public");
  const { data } = await pub.from("settings").select("key, value").like("key", `${KEY_PREFIX}%`);
  let created = 0;
  const errors: string[] = [];
  for (const row of data || []) {
    const brandId = String(row.key).slice(KEY_PREFIX.length);
    const s = sanitize(row.value);
    if (!s.enabled || s.template_id) continue;
    const { data: brand } = await pub.from("cm_clients").select("name").eq("id", brandId).maybeSingle();
    const result = await ensureUtilityFirstTouchTemplate(brandId, (brand?.name as string) || "nuestro equipo");
    if ("error" in result) {
      errors.push(`${brandId}: ${result.error}`);
      continue;
    }
    await setFirstTouchUtilitySettings(brandId, { ...s, template_id: result.id });
    if (result.created) created += 1;
  }
  return { created, errors };
}
