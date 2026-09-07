/**
 * "No quiero que me contacten": regla determinista, sin depender de la IA.
 *
 * - Detecta en el mensaje del cliente frases de rechazo/baja.
 * - Marca el contacto: custom_fields.do_not_contact = true, etapa "Perdido",
 *   y deja nota interna.
 * - `isDoNotContact` lo usan la sincronización de leads y la retoma para
 *   excluirlo sí o sí.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const OPT_OUT_PATTERN =
  /\b(no (quiero|deseo|me interesa|estoy interesad[oa]|necesito)( (que me|ser|nada|m[aá]s|que me sigan))?( (contact|escrib|llam|molest|env[ií]|mand)\w*)?|no me (escriban|escribas|llamen|llames|contacten|contactes|molesten|molestes|manden|mandes|env[ií]en)|dejen? de (escribir|llamar|molestar|enviar|mandar)|no (vuelvan|vuelvas) a (escribir|llamar|contactar)|no molestar|darme de baja|d[eé]nme de baja|quitenme|qu[ií]tame|elim[ií]n(a|en)me|borr(a|en)me|unsubscribe|stop)\b/i;

export function looksLikeOptOut(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t || t.length > 300) return false; // frases cortas y directas; textos largos los evalúa la IA
  return OPT_OUT_PATTERN.test(t);
}

export function isDoNotContact(
  contact: { custom_fields?: Record<string, unknown> | null; lifecycle_stage_id?: string | null } | null | undefined,
  stopStageIds: Set<string> = new Set(),
): boolean {
  if (!contact) return false;
  if (contact.custom_fields?.do_not_contact === true) return true;
  if (contact.lifecycle_stage_id && stopStageIds.has(contact.lifecycle_stage_id)) return true;
  return false;
}

/** Ids de las etapas "no contactar" (Perdido, No contactar, Descartado…) de la organización. */
export async function stopStageIdsForOrg(
  admin: Pick<SupabaseClient, "from">,
  organizationId: string,
  names: string[] = ["perdido", "no contactar", "descartado", "baja"],
): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data } = await admin.from("lifecycle_stages").select("id, name").eq("organization_id", organizationId);
  for (const s of (data || []) as Array<{ id: string; name: string | null }>) {
    if (names.includes(String(s.name || "").toLowerCase().trim())) ids.add(s.id);
  }
  return ids;
}

/** Marca el contacto como "no contactar" (bandera + etapa Perdido + nota). */
export async function markDoNotContact(
  admin: Pick<SupabaseClient, "from">,
  input: { contactId: string; organizationId: string; conversationId?: string | null; reason: string },
): Promise<void> {
  const { data: contact } = await admin
    .from("contacts")
    .select("custom_fields")
    .eq("id", input.contactId)
    .maybeSingle();
  const cf = ((contact as { custom_fields?: Record<string, unknown> | null } | null)?.custom_fields || {}) as Record<string, unknown>;
  if (cf.do_not_contact === true) return;

  const { data: stage } = await admin
    .from("lifecycle_stages")
    .select("id")
    .eq("organization_id", input.organizationId)
    .ilike("name", "perdido")
    .limit(1)
    .maybeSingle();

  await admin
    .from("contacts")
    .update({
      custom_fields: { ...cf, do_not_contact: true, do_not_contact_at: new Date().toISOString(), do_not_contact_reason: input.reason.slice(0, 200) },
      ...(stage ? { lifecycle_stage_id: (stage as { id: string }).id } : {}),
    })
    .eq("id", input.contactId);

  if (input.conversationId) {
    try {
      const { addSystemNote } = await import("@/lib/smarttalk/internal-notes");
      await addSystemNote({
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        content: `El cliente pidió no ser contactado ("${input.reason.slice(0, 120)}"). Queda fuera de sincronización y retoma.`,
      });
    } catch {
      // best-effort
    }
  }
}
