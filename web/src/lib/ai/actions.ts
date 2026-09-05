import { createAdminClient } from "@/lib/supabase/admin";
import type { AIActionConfig } from "@/types/database";
import { notify } from "@/lib/notify/dispatcher";
import { addSystemNote } from "@/lib/smarttalk/internal-notes";
import { brandAdvisorEmails } from "@/lib/smarttalk/lead-alerts";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.comunitymanager.io").replace(/\/$/, "");

/**
 * Avisa a los asesores (por email) que el agente IA les pasó un lead.
 * Best-effort: nunca lanza — un fallo de notificación no debe romper el handoff.
 */
async function notifyAdvisorsOfAssignment(
  admin: ReturnType<typeof createAdminClient>,
  opts: { organizationId: string; conversationId: string; contactId: string; emails: string[]; assigneeLabel: string }
): Promise<void> {
  try {
    // Además del asesor/equipo asignado, TODOS los asesores de la empresa del
    // lead reciben el aviso (regla de la casa: asesor asignado a una empresa
    // = recibe los correos de sus leads).
    const { data: conv } = await admin
      .from("conversations")
      .select("brand_id")
      .eq("id", opts.conversationId)
      .maybeSingle();
    const brandEmails = await brandAdvisorEmails(admin, (conv?.brand_id as string | null) || null);
    const emails = [
      ...new Set(
        [...opts.emails, ...brandEmails].filter((e) => typeof e === "string" && e.includes("@"))
      ),
    ];
    if (emails.length === 0) return;

    let contactName = "Un lead";
    try {
      const { data: c } = await admin
        .from("contacts")
        .select("name")
        .eq("id", opts.contactId)
        .maybeSingle();
      if (c?.name) contactName = c.name as string;
    } catch {}

    const link = `${APP_URL}/inbox?conversation=${opts.conversationId}`;
    const subject = `🔔 Nuevo lead para atender: ${contactName}`;
    const text =
      `El agente de IA calificó a ${contactName} y lo asignó a ${opts.assigneeLabel}. ` +
      `Continúa la conversación aquí: ${link}`;
    const html =
      `<p>El agente de IA calificó a <b>${contactName}</b> y lo asignó a <b>${opts.assigneeLabel}</b>.</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Abrir conversación</a></p>`;

    await notify({
      organizationId: opts.organizationId,
      channels: ["email"],
      recipients: { email: emails },
      template: "custom",
      variables: { subject, text, html },
    });
  } catch (e) {
    console.warn("[ai-actions] notificación de handoff falló (no crítico):", e);
  }
}

export type AIAction =
  | "close_conversation"
  | "assign_agent"
  | "assign_team"
  | "update_lifecycle"
  | "update_contact_field"
  | "update_tag"
  | "add_comment"
  | "trigger_workflow"
  | "http_request";

export interface ParsedAction {
  type: AIAction;
  params: string[];
}

/**
 * Parses action markers from AI response text.
 * Markers look like: [ACTION:type] or [ACTION:type:param1:param2]
 */
export function processAIActions(rawResponse: string): {
  cleanText: string;
  actions: ParsedAction[];
} {
  const actionRegex = /\[ACTION:([a-z_]+)(?::([^\]]*))?\]/g;
  const actions: ParsedAction[] = [];
  let match;

  while ((match = actionRegex.exec(rawResponse)) !== null) {
    const type = match[1] as AIAction;
    const paramStr = match[2] || "";
    const params = paramStr ? paramStr.split(":").map((p) => p.trim()) : [];
    actions.push({ type, params });
  }

  const cleanText = rawResponse
    .replace(actionRegex, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanText, actions };
}

/**
 * Executes parsed AI actions against the database.
 */
export async function executeAIActions(
  actions: ParsedAction[],
  context: {
    conversationId: string;
    contactId: string;
    organizationId: string;
    enabledActions: AIActionConfig[];
  }
): Promise<{ executed: string[]; errors: string[] }> {
  const admin = createAdminClient();
  const executed: string[] = [];
  const errors: string[] = [];

  const enabledTypes = new Set(
    context.enabledActions.filter((a) => a.enabled).map((a) => a.type)
  );

  for (const action of actions) {
    if (!enabledTypes.has(action.type)) continue;

    try {
      switch (action.type) {
        case "close_conversation": {
          await admin
            .from("conversations")
            .update({
              status: "closed",
              resolved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", context.conversationId);
          executed.push("close_conversation");
          break;
        }

        case "assign_agent": {
          if (action.params[0]) {
            const { data: targetAgent } = await admin
              .from("agents")
              .select("id, name, email")
              .eq("organization_id", context.organizationId)
              .ilike("name", `%${action.params[0]}%`)
              .limit(1)
              .single();

            if (targetAgent) {
              const { data: current } = await admin
                .from("conversations")
                .select("assigned_agent_id")
                .eq("id", context.conversationId)
                .maybeSingle();
              const alreadyAssigned = current?.assigned_agent_id === targetAgent.id;
              await admin
                .from("conversations")
                .update({
                  assigned_agent_id: targetAgent.id,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", context.conversationId);
              executed.push(`assign_agent:${action.params[0]}`);
              // Notifica al asesor asignado (una vez: si el agente repite la
              // acción en otro turno, no se vuelve a enviar el correo).
              if (!alreadyAssigned) await notifyAdvisorsOfAssignment(admin, {
                organizationId: context.organizationId,
                conversationId: context.conversationId,
                contactId: context.contactId,
                emails: targetAgent.email ? [targetAgent.email as string] : [],
                assigneeLabel: (targetAgent.name as string) || "ti",
              });
            }
          }
          break;
        }

        case "assign_team": {
          if (action.params[0]) {
            const { data: team } = await admin
              .from("teams")
              .select("id, name")
              .eq("organization_id", context.organizationId)
              .ilike("name", `%${action.params[0]}%`)
              .limit(1)
              .single();

            if (team) {
              // Merge del metadata: no sobrescribir (preserva ai_turn_count, etc.)
              const { data: conv } = await admin
                .from("conversations")
                .select("metadata")
                .eq("id", context.conversationId)
                .maybeSingle();
              const previousMeta = (conv?.metadata as Record<string, unknown>) || {};
              const alreadyAssigned = previousMeta.assigned_team_id === team.id;
              const mergedMeta = { ...previousMeta, assigned_team_id: team.id };
              await admin
                .from("conversations")
                .update({
                  metadata: mergedMeta,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", context.conversationId);
              executed.push(`assign_team:${action.params[0]}`);

              // Si el agente repite la acción en otro turno, no se reenvía el
              // correo (antes llegaba duplicado).
              if (alreadyAssigned) break;

              // Notifica a los miembros del equipo (agent_teams → agents.email)
              // y, dentro de notifyAdvisorsOfAssignment, a los asesores de la marca.
              const { data: links } = await admin
                .from("agent_teams")
                .select("agent:agents(email)")
                .eq("team_id", team.id);
              const emails = (links || [])
                .map((l) => (l as { agent?: { email?: string } }).agent?.email)
                .filter((e): e is string => typeof e === "string");
              await notifyAdvisorsOfAssignment(admin, {
                organizationId: context.organizationId,
                conversationId: context.conversationId,
                contactId: context.contactId,
                emails,
                assigneeLabel: `el equipo ${(team.name as string) || action.params[0]}`,
              });
            }
          }
          break;
        }

        case "update_lifecycle": {
          if (action.params[0]) {
            const { data: stage } = await admin
              .from("lifecycle_stages")
              .select("id")
              .eq("organization_id", context.organizationId)
              .ilike("name", `%${action.params[0]}%`)
              .limit(1)
              .single();

            if (stage) {
              await admin
                .from("contacts")
                .update({ lifecycle_stage_id: stage.id })
                .eq("id", context.contactId);
              executed.push(`update_lifecycle:${action.params[0]}`);
            }
          }
          break;
        }

        case "update_contact_field": {
          if (action.params[0] && action.params[1]) {
            const fieldKey = action.params[0];
            const fieldValue = action.params[1];
            const { data: contact } = await admin
              .from("contacts")
              .select("custom_fields")
              .eq("id", context.contactId)
              .single();

            if (contact) {
              const fields = (contact.custom_fields || {}) as Record<string, string>;
              fields[fieldKey] = fieldValue;
              await admin
                .from("contacts")
                .update({ custom_fields: fields })
                .eq("id", context.contactId);
              executed.push(`update_contact_field:${fieldKey}:${fieldValue}`);
            }
          }
          break;
        }

        case "update_tag": {
          if (action.params[0]) {
            const tagName = action.params[0];
            const { data: contact } = await admin
              .from("contacts")
              .select("tags")
              .eq("id", context.contactId)
              .single();

            if (contact) {
              const tags = Array.isArray(contact.tags) ? [...contact.tags] : [];
              if (!tags.includes(tagName)) {
                tags.push(tagName);
                await admin
                  .from("contacts")
                  .update({ tags })
                  .eq("id", context.contactId);
              }
              executed.push(`update_tag:${tagName}`);
            }
          }
          break;
        }

        case "add_comment": {
          if (action.params[0]) {
            // agent_id es NOT NULL: la nota se atribuye a un asesor real
            // (ver lib/smarttalk/internal-notes.ts); antes fallaba en silencio.
            const noteId = await addSystemNote({
              conversationId: context.conversationId,
              organizationId: context.organizationId,
              content: action.params.join(":"),
              prefix: "[IA]",
            });
            if (noteId) executed.push("add_comment");
          }
          break;
        }

        case "trigger_workflow": {
          // Placeholder for workflow triggering
          executed.push(`trigger_workflow:${action.params[0] || "unknown"}`);
          break;
        }

        case "http_request": {
          const actionConfig = context.enabledActions.find(
            (a) => a.type === "http_request" && a.enabled
          );
          if (actionConfig?.config) {
            const { url, method } = actionConfig.config as { url?: string; method?: string };
            if (url) {
              try {
                await fetch(url, {
                  method: method || "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    conversation_id: context.conversationId,
                    contact_id: context.contactId,
                    params: action.params,
                  }),
                });
                executed.push("http_request");
              } catch (e) {
                errors.push(`http_request: ${(e as Error).message}`);
              }
            }
          }
          break;
        }
      }
    } catch (e) {
      errors.push(`${action.type}: ${(e as Error).message}`);
    }
  }

  return { executed, errors };
}
