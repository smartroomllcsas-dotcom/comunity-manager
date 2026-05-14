import { createAdminClient } from "@/lib/supabase/admin";
import type { AIActionConfig } from "@/types/database";

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
              .select("id")
              .eq("organization_id", context.organizationId)
              .ilike("name", `%${action.params[0]}%`)
              .limit(1)
              .single();

            if (targetAgent) {
              await admin
                .from("conversations")
                .update({
                  assigned_agent_id: targetAgent.id,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", context.conversationId);
              executed.push(`assign_agent:${action.params[0]}`);
            }
          }
          break;
        }

        case "assign_team": {
          if (action.params[0]) {
            const { data: team } = await admin
              .from("teams")
              .select("id")
              .eq("organization_id", context.organizationId)
              .ilike("name", `%${action.params[0]}%`)
              .limit(1)
              .single();

            if (team) {
              await admin
                .from("conversations")
                .update({
                  metadata: { assigned_team_id: team.id },
                  updated_at: new Date().toISOString(),
                })
                .eq("id", context.conversationId);
              executed.push(`assign_team:${action.params[0]}`);
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
            await admin.from("internal_notes").insert({
              conversation_id: context.conversationId,
              agent_id: null,
              content: `[IA] ${action.params.join(":")}`,
            });
            executed.push("add_comment");
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
