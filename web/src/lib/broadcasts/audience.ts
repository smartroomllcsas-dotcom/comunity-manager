/**
 * Audiencia de una difusión: SIEMPRE dentro de una empresa (brand).
 *
 * Toma los contactos de la marca, aplica los filtros elegidos y excluye a
 * quien no debe recibir nada: sin número real, "no contactar"/Perdido,
 * número sin WhatsApp, limitados por Meta (marketing) y, si se pide, quien ya
 * recibió esa misma plantilla. Devuelve incluidos y excluidos con motivo para
 * que la pantalla lo muestre antes de enviar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type BroadcastChannelKind = "whatsapp_cloud" | "waha";

export type BroadcastAudience = {
  /** Nombres de etapa ("Nuevo", "Calificado"…) o "sin_etapa". Vacío = todas. */
  stages?: string[];
  /** Etiquetas del contacto (cualquiera de ellas). */
  tags?: string[];
  /** Origen: "facebook_lead_form" | "whatsapp" | "instagram" | "messenger" | "otro". */
  sources?: string[];
  /** Fecha de llegada del contacto (YYYY-MM-DD, inclusive). */
  createdFrom?: string;
  createdTo?: string;
  /** Sólo quienes no escriben hace al menos N días (o nunca escribieron). */
  noReplyDays?: number;
  /** No enviar a quien ya recibió esta misma plantilla (últimos 30 días). */
  excludeTemplateRecipients?: boolean;
  /** Selección manual: sólo estos contactos (además de los filtros). */
  contactIds?: string[];
};

export type AudienceContact = {
  id: string;
  name: string | null;
  phone: string; // dígitos
  stage: string | null;
  source: string;
  createdAt: string;
  lastInboundAt: string | null;
  customFields: Record<string, unknown>;
};

export type ExcludedContact = { id: string; name: string | null; phone: string | null; reason: ExclusionReason };

export type ExclusionReason =
  | "sin_telefono"
  | "no_contactar"
  | "sin_whatsapp"
  | "meta_limito_marketing"
  | "ya_recibio_plantilla";

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  sin_telefono: "Sin número de teléfono real",
  no_contactar: "Pidió no ser contactado o está en Perdido",
  sin_whatsapp: "WhatsApp rechazó el número (sin WhatsApp / inválido)",
  meta_limito_marketing: "Meta limitó los mensajes de marketing a este número",
  ya_recibio_plantilla: "Ya recibió esta plantilla en los últimos 30 días",
};

export type AudienceResult = {
  included: AudienceContact[];
  excluded: ExcludedContact[];
  counts: { total: number; included: number; excluded: number; byReason: Partial<Record<ExclusionReason, number>> };
};

type ContactRow = {
  id: string;
  name: string | null;
  wa_id: string | null;
  tags: string[] | null;
  created_at: string;
  last_message_at: string | null;
  lifecycle_stage_id: string | null;
  visibility_status: string | null;
  custom_fields: Record<string, unknown> | null;
};

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * Número "real": entre 8 y 13 dígitos. Los ids @lid de WhatsApp tienen 14-15
 * dígitos y no son teléfonos (ningún país usa más de 13 con indicativo).
 */
export function isRealPhone(d: string): boolean {
  return d.length >= 8 && d.length <= 13;
}

export function sourceOf(cf: Record<string, unknown> | null): string {
  const s = String(cf?.source || "");
  if (s === "facebook_lead_form") return "facebook_lead_form";
  if (s) return s;
  return "otro";
}

export async function resolveAudience(
  admin: Pick<SupabaseClient, "from">,
  input: {
    orgId: string;
    brandId: string;
    audience: BroadcastAudience;
    channelKind: BroadcastChannelKind;
    /** Nombre de la plantilla (para "ya la recibió"). */
    templateName?: string | null;
    /** Cliente de `public` para consultar envíos previos de plantilla. */
    publicAdmin?: Pick<SupabaseClient, "from">;
  }
): Promise<AudienceResult> {
  const { audience } = input;

  const { data: stagesData } = await admin.from("lifecycle_stages").select("id, name").eq("organization_id", input.orgId);
  const stages = (stagesData || []) as Array<{ id: string; name: string }>;
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const stopIds = new Set(stages.filter((s) => ["perdido", "no contactar", "descartado", "baja"].includes(s.name.toLowerCase())).map((s) => s.id));

  let q = admin
    .from("contacts")
    .select("id, name, wa_id, tags, created_at, last_message_at, lifecycle_stage_id, visibility_status, custom_fields")
    .eq("organization_id", input.orgId)
    .eq("brand_id", input.brandId)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (audience.contactIds?.length) q = q.in("id", audience.contactIds);
  if (audience.tags?.length) q = q.overlaps("tags", audience.tags);
  if (audience.createdFrom) q = q.gte("created_at", `${audience.createdFrom}T00:00:00-05:00`);
  if (audience.createdTo) q = q.lte("created_at", `${audience.createdTo}T23:59:59-05:00`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = ((data || []) as ContactRow[]).filter((r) => r.visibility_status !== "restricted");

  // Quién ya recibió esta plantilla (por teléfono) en 30 días
  const alreadySent = new Set<string>();
  if (audience.excludeTemplateRecipients && input.templateName && input.publicAdmin) {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: sends } = await input.publicAdmin
      .from("cm_wa_template_sends")
      .select("to_phone")
      .eq("client_id", input.brandId)
      .eq("template_name", input.templateName)
      .gte("created_at", since)
      .limit(10000);
    for (const s of (sends || []) as Array<{ to_phone: string }>) alreadySent.add(digits(s.to_phone));
  }

  // Última vez que el contacto escribió (para "sin respuesta hace N días")
  let lastInbound = new Map<string, string>();
  if (audience.noReplyDays && rows.length) {
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data: msgs } = await admin
        .from("messages")
        .select("contact_id, created_at")
        .in("contact_id", ids.slice(i, i + 200))
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(5000);
      for (const m of (msgs || []) as Array<{ contact_id: string; created_at: string }>) {
        if (!lastInbound.has(m.contact_id)) lastInbound.set(m.contact_id, m.created_at);
      }
    }
  } else {
    lastInbound = new Map();
  }

  const included: AudienceContact[] = [];
  const excluded: ExcludedContact[] = [];
  const byReason: Partial<Record<ExclusionReason, number>> = {};
  const exclude = (r: ContactRow, phone: string | null, reason: ExclusionReason) => {
    excluded.push({ id: r.id, name: r.name, phone, reason });
    byReason[reason] = (byReason[reason] || 0) + 1;
  };

  const wantStages = new Set((audience.stages || []).map((s) => s.toLowerCase()));
  const wantSources = new Set(audience.sources || []);
  const noReplyCutoff = audience.noReplyDays ? Date.now() - audience.noReplyDays * 86400_000 : null;

  for (const r of rows) {
    const cf = r.custom_fields || {};
    const stage = r.lifecycle_stage_id ? stageName.get(r.lifecycle_stage_id) || null : null;
    const src = sourceOf(cf);

    // Filtros elegidos
    if (wantStages.size) {
      const key = (stage || "sin_etapa").toLowerCase();
      if (!wantStages.has(key)) continue;
    }
    if (wantSources.size && !wantSources.has(src)) continue;
    if (noReplyCutoff) {
      const last = lastInbound.get(r.id);
      if (last && new Date(last).getTime() > noReplyCutoff) continue;
    }

    // Exclusiones obligatorias
    const phone = digits(cf.phone || cf.phone_number || r.wa_id);
    if (!isRealPhone(phone)) {
      exclude(r, phone || null, "sin_telefono");
      continue;
    }
    if (cf.do_not_contact === true || (r.lifecycle_stage_id && stopIds.has(r.lifecycle_stage_id))) {
      exclude(r, phone, "no_contactar");
      continue;
    }
    const touch = String(cf.wa_first_touch || "");
    if (/no tiene WhatsApp|invalid_phone|inválido/i.test(touch)) {
      exclude(r, phone, "sin_whatsapp");
      continue;
    }
    if (input.channelKind === "whatsapp_cloud" && /limit[oó] los mensajes de marketing|dej[oó] de recibir mensajes de marketing/i.test(touch)) {
      exclude(r, phone, "meta_limito_marketing");
      continue;
    }
    if (alreadySent.has(phone)) {
      exclude(r, phone, "ya_recibio_plantilla");
      continue;
    }

    included.push({
      id: r.id,
      name: r.name,
      phone,
      stage,
      source: src,
      createdAt: r.created_at,
      lastInboundAt: lastInbound.get(r.id) || null,
      customFields: cf,
    });
  }

  return {
    included,
    excluded,
    counts: { total: included.length + excluded.length, included: included.length, excluded: excluded.length, byReason },
  };
}

/**
 * Valores de variables por contacto. Una variable puede ser texto fijo o un
 * token: {{contacto.nombre}}, {{contacto.empresa}}, {{contacto.ciudad}},
 * {{contacto.telefono}}, {{contacto.correo}}.
 */
export function renderVariables(
  variables: Record<string, string>,
  contact: Pick<AudienceContact, "name" | "phone" | "customFields">
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(variables || {})) out[k] = renderText(v, contact);
  return out;
}

export function renderText(text: string, contact: Pick<AudienceContact, "name" | "phone" | "customFields">): string {
  const cf = contact.customFields || {};
  const fullName = String(cf.full_name || contact.name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || "";
  const values: Record<string, string> = {
    nombre: firstName || "Hola",
    nombre_completo: fullName,
    empresa: String(cf.company_name || cf.empresa || ""),
    ciudad: String(cf.ciudad || cf.city || ""),
    telefono: contact.phone,
    correo: String(cf.email || cf.correo || ""),
  };
  return String(text || "").replace(/\{\{\s*contacto\.([a-z_]+)\s*\}\}/gi, (_, key: string) => values[key.toLowerCase()] ?? "");
}
