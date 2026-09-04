/**
 * Notas internas escritas por el sistema (agente de IA, webhook de Cal.com…).
 *
 * `smarttalk.internal_notes.agent_id` es NOT NULL en producción: las notas
 * que se insertaban con `agent_id: null` fallaban en silencio (la tabla
 * estaba vacía). Mientras la migración 046 no se aplique, la nota se
 * atribuye a un asesor real: el asignado a la conversación, o un
 * administrador de la organización. El contenido lleva un prefijo que deja
 * claro que la escribió el sistema.
 */
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

async function resolveAuthorAgent(
  admin: Admin,
  conversationId: string,
  organizationId: string | null,
): Promise<string | null> {
  const { data: conv } = await admin
    .from("conversations")
    .select("assigned_agent_id, organization_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (conv?.assigned_agent_id) return conv.assigned_agent_id as string;

  const orgId = organizationId || (conv?.organization_id as string | undefined);
  if (!orgId) return null;

  const { data: admins } = await admin
    .from("agents")
    .select("id, is_super_admin")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true })
    .limit(20);
  const list = (admins || []) as Array<{ id: string; is_super_admin: boolean | null }>;
  return (list.find((a) => a.is_super_admin)?.id || list[0]?.id || null) as string | null;
}

/**
 * Inserta una nota interna en la conversación. Devuelve el id o null si no
 * pudo (nunca lanza: una nota jamás debe romper el flujo que la origina).
 */
export async function addSystemNote(input: {
  conversationId: string;
  organizationId?: string | null;
  content: string;
  /** Autor explícito; si no viene se resuelve un asesor de la conversación/org. */
  agentId?: string | null;
  /** Prefijo visible, p. ej. "[IA]" o "[Agenda]". */
  prefix?: string;
}): Promise<string | null> {
  try {
    const admin = createAdminClient("smarttalk");
    const agentId =
      input.agentId ||
      (await resolveAuthorAgent(admin, input.conversationId, input.organizationId || null));
    if (!agentId) {
      console.warn("[internal-notes] sin asesor al que atribuir la nota", {
        conversation_id: input.conversationId,
      });
      return null;
    }
    const content = input.prefix ? `${input.prefix} ${input.content}` : input.content;
    const { data, error } = await admin
      .from("internal_notes")
      .insert({ conversation_id: input.conversationId, agent_id: agentId, content })
      .select("id")
      .single();
    if (error) {
      console.warn("[internal-notes] insert falló:", error.message);
      return null;
    }
    return (data?.id as string) || null;
  } catch (e) {
    console.warn("[internal-notes] excepción:", e);
    return null;
  }
}
