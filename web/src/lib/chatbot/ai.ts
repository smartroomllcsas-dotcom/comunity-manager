import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, getOrgWhatsAppCredentials } from "@/lib/whatsapp/api";
import { processAIActions, executeAIActions } from "@/lib/ai/actions";
import type { AIActionConfig } from "@/types/database";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function generateAIResponse(params: {
  systemPrompt: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  knowledgeBase?: string;
  maxTokens?: number;
}): Promise<string> {
  let fullSystemPrompt = params.systemPrompt;
  if (params.knowledgeBase) {
    fullSystemPrompt += `\n\n## Base de Conocimiento:\n${params.knowledgeBase}`;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: params.maxTokens || 1024,
      system: fullSystemPrompt,
      messages: params.conversationHistory,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

interface AIContext {
  conversationId: string;
  contactWaId: string;
  contactId?: string;
  organizationId: string;
  messageText: string;
  channelId?: string;
}

interface AIAgentConfig {
  id: string;
  system_prompt: string;
  actions: AIActionConfig[];
  max_tokens: number;
  escalation_keywords?: string[];
  max_turns?: number;
}

export async function processWithAIAgent(
  context: AIContext,
  agentConfig: AIAgentConfig,
  turnCount: number
): Promise<boolean> {
  const admin = createAdminClient();

  // Check escalation keywords
  if (agentConfig.escalation_keywords && agentConfig.escalation_keywords.length > 0) {
    const lowerMsg = context.messageText.toLowerCase();
    for (const keyword of agentConfig.escalation_keywords) {
      if (lowerMsg.includes(keyword.toLowerCase())) {
        await admin
          .from("conversations")
          .update({ metadata: { ai_turn_count: 0 } })
          .eq("id", context.conversationId);
        return false;
      }
    }
  }

  // Check max turns
  const maxTurns = agentConfig.max_turns || 20;
  if (turnCount >= maxTurns) {
    await admin
      .from("conversations")
      .update({ metadata: { ai_turn_count: 0 } })
      .eq("id", context.conversationId);
    return false;
  }

  // Get recent messages for history
  const { data: recentMessages } = await admin
    .from("messages")
    .select("direction, content, is_bot")
    .eq("conversation_id", context.conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const chatHistory = (recentMessages || []).reverse().map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content:
      m.content && typeof m.content === "object" && "text" in m.content
        ? (m.content as { text: string }).text
        : "[media]",
  }));

  // Build knowledge base from agent's sources
  const { data: sources } = await admin
    .from("knowledge_sources")
    .select("name, content")
    .eq("ai_agent_id", agentConfig.id)
    .eq("status", "active");

  const knowledgeParts: string[] = [];
  if (sources) {
    for (const source of sources) {
      if (source.content) {
        knowledgeParts.push(`[${source.name}]: ${source.content}`);
      }
    }
  }

  // Build action instructions
  const enabledActions = (agentConfig.actions || []).filter((a) => a.enabled);
  let actionInstructions = "";
  if (enabledActions.length > 0) {
    actionInstructions =
      "\n\n## Acciones Disponibles\nPuedes ejecutar acciones incluyendo marcadores en tu respuesta. Usa el formato [ACTION:tipo] o [ACTION:tipo:parametro].\n";
    for (const action of enabledActions) {
      switch (action.type) {
        case "close_conversation":
          actionInstructions += "- [ACTION:close_conversation] - Cerrar la conversacion\n";
          break;
        case "assign_agent":
          actionInstructions += "- [ACTION:assign_agent:nombre] - Asignar a un agente\n";
          break;
        case "assign_team":
          actionInstructions += "- [ACTION:assign_team:nombre] - Asignar a un equipo\n";
          break;
        case "update_lifecycle":
          actionInstructions += "- [ACTION:update_lifecycle:etapa] - Actualizar ciclo de vida\n";
          break;
        case "update_contact_field":
          actionInstructions += "- [ACTION:update_contact_field:campo:valor] - Actualizar campo\n";
          break;
        case "update_tag":
          actionInstructions += "- [ACTION:update_tag:etiqueta] - Agregar etiqueta\n";
          break;
        case "add_comment":
          actionInstructions += "- [ACTION:add_comment:texto] - Agregar comentario interno\n";
          break;
        case "trigger_workflow":
          actionInstructions += "- [ACTION:trigger_workflow:nombre] - Activar flujo\n";
          break;
        case "http_request":
          actionInstructions += "- [ACTION:http_request] - Peticion HTTP\n";
          break;
      }
      if (action.instructions) {
        actionInstructions += `  Instrucciones: ${action.instructions}\n`;
      }
    }
  }

  let rawResponse: string;
  try {
    rawResponse = await generateAIResponse({
      systemPrompt: agentConfig.system_prompt + actionInstructions,
      conversationHistory: chatHistory,
      knowledgeBase: knowledgeParts.length > 0 ? knowledgeParts.join("\n\n") : undefined,
      maxTokens: agentConfig.max_tokens,
    });
  } catch (error) {
    console.error("AI call failed:", error);
    return false;
  }

  // Process actions
  const { cleanText, actions } = processAIActions(rawResponse);

  if (cleanText.includes("[ESCALATE]")) {
    await admin
      .from("conversations")
      .update({ metadata: { ai_turn_count: 0 } })
      .eq("id", context.conversationId);
    return false;
  }

  // Execute actions if any
  if (actions.length > 0 && context.contactId) {
    await executeAIActions(actions, {
      conversationId: context.conversationId,
      contactId: context.contactId,
      organizationId: context.organizationId,
      enabledActions: agentConfig.actions,
    });
  }

  // Send the cleaned response via WhatsApp
  const { phoneNumberId, accessToken } = await getOrgWhatsAppCredentials(
    context.organizationId,
    context.channelId
  );
  const result = await sendText({
    to: context.contactWaId,
    text: cleanText,
    phoneNumberId,
    accessToken,
  });

  await admin.from("messages").insert({
    conversation_id: context.conversationId,
    direction: "outbound",
    type: "text",
    content: { type: "text", text: cleanText },
    wa_message_id: result.messages[0]?.id,
    status: "sent",
    is_bot: true,
  });

  await admin
    .from("conversations")
    .update({
      metadata: { ai_turn_count: turnCount + 1, ai_agent_id: agentConfig.id },
      last_message_preview: cleanText.slice(0, 100),
      updated_at: new Date().toISOString(),
    })
    .eq("id", context.conversationId);

  return true;
}

// Legacy compatibility wrapper for old ai_config based flow
export async function processWithAI(
  context: AIContext & { channelId?: string },
  config: {
    system_prompt: string;
    knowledge_base: string[];
    escalation_rules: { keywords: string[]; max_turns: number };
    max_turns: number;
  },
  turnCount: number
): Promise<boolean> {
  const admin = createAdminClient();

  // Check escalation keywords
  const lowerMsg = context.messageText.toLowerCase();
  for (const keyword of config.escalation_rules.keywords) {
    if (lowerMsg.includes(keyword.toLowerCase())) {
      await admin
        .from("conversations")
        .update({ metadata: { ai_turn_count: 0 } })
        .eq("id", context.conversationId);
      return false;
    }
  }

  if (turnCount >= config.max_turns) {
    await admin
      .from("conversations")
      .update({ metadata: { ai_turn_count: 0 } })
      .eq("id", context.conversationId);
    return false;
  }

  const { data: recentMessages } = await admin
    .from("messages")
    .select("direction, content, is_bot")
    .eq("conversation_id", context.conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const chatHistory = (recentMessages || []).reverse().map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content:
      m.content && typeof m.content === "object" && "text" in m.content
        ? (m.content as { text: string }).text
        : "[media]",
  }));

  const knowledgeContext =
    config.knowledge_base.length > 0
      ? config.knowledge_base.join("\n\n")
      : undefined;

  let aiResponse: string;
  try {
    aiResponse = await generateAIResponse({
      systemPrompt: config.system_prompt,
      conversationHistory: chatHistory,
      knowledgeBase: knowledgeContext,
    });
  } catch (error) {
    console.error("AI call failed:", error);
    return false;
  }

  if (aiResponse.includes("[ESCALATE]")) {
    await admin
      .from("conversations")
      .update({ metadata: { ai_turn_count: 0 } })
      .eq("id", context.conversationId);
    return false;
  }

  const { phoneNumberId, accessToken } = await getOrgWhatsAppCredentials(
    context.organizationId,
    context.channelId
  );
  const result = await sendText({
    to: context.contactWaId,
    text: aiResponse,
    phoneNumberId,
    accessToken,
  });

  await admin.from("messages").insert({
    conversation_id: context.conversationId,
    direction: "outbound",
    type: "text",
    content: { type: "text", text: aiResponse },
    wa_message_id: result.messages[0]?.id,
    status: "sent",
    is_bot: true,
  });

  await admin
    .from("conversations")
    .update({
      metadata: { ai_turn_count: turnCount + 1 },
      last_message_preview: aiResponse.slice(0, 100),
    })
    .eq("id", context.conversationId);

  return true;
}
