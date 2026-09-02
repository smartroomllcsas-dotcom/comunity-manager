import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, getOrgWhatsAppCredentials } from "@/lib/whatsapp/api";
import { processAIActions, executeAIActions } from "@/lib/ai/actions";
import type { AIActionConfig } from "@/types/database";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Modelo del agente de IA. Configurable por env para poder cambiarlo sin
// redeploy. El anterior "claude-sonnet-4-20250514" quedó descontinuado y
// Anthropic devolvía 404 (model not_found), por eso el agente no respondía.
const CHATBOT_MODEL = process.env.CHATBOT_AI_MODEL || "claude-sonnet-5";

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
      model: CHATBOT_MODEL,
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
  // Extrae el texto de TODOS los bloques tipo "text" (no asumir content[0]):
  // algunos modelos devuelven otros bloques primero, y content[0].text sería
  // undefined → rompía processAIActions con "Cannot read properties of
  // undefined (reading 'replace')".
  const blocks: Array<{ type?: string; text?: string }> = Array.isArray(data?.content)
    ? data.content
    : [];
  const text = blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
  return text;
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

  // Contexto por empresa/marca: instrucciones que el administrador definió
  // para ESTA marca (qué información del proyecto recolectar, tono, objetivo)
  // y el enlace de agenda al que hay que llevar al cliente.
  let brandContext = "";
  let brochure: { url: string; filename: string; mode: string } | null = null;
  let responseDelaySeconds = 0;
  try {
    const { data: convRow } = await admin
      .from("conversations")
      .select("brand_id")
      .eq("id", context.conversationId)
      .maybeSingle();
    if (convRow?.brand_id) {
      const { createAdminClient: createPublicAdmin } = await import("@/lib/supabase/admin");
      const pub = createPublicAdmin("public");
      const { data: settings } = await pub
        .from("cm_lead_agent_settings")
        .select("agent_context, booking_url, agent_role, agent_tone, agent_goal, brochure_url, brochure_filename, brochure_mode, response_delay_seconds")
        .eq("client_id", convRow.brand_id)
        .maybeSingle();
      if (settings?.response_delay_seconds) {
        responseDelaySeconds = Math.max(0, Math.min(300, Number(settings.response_delay_seconds) || 0));
      }
      if (settings?.brochure_url && settings.brochure_mode && settings.brochure_mode !== "off") {
        brochure = {
          url: settings.brochure_url as string,
          filename: (settings.brochure_filename as string) || "catalogo.pdf",
          mode: settings.brochure_mode as string,
        };
      }
      if (settings) {
        const { AGENT_ROLES, AGENT_TONES, AGENT_GOALS, presetPrompt } = await import(
          "@/lib/whatsapp/cloud/agent-presets"
        );
        const parts: string[] = [];
        const rolePrompt = presetPrompt(AGENT_ROLES, settings.agent_role);
        const tonePrompt = presetPrompt(AGENT_TONES, settings.agent_tone);
        const goalPrompt = presetPrompt(AGENT_GOALS, settings.agent_goal);
        if (rolePrompt) parts.push(rolePrompt);
        if (tonePrompt) parts.push(tonePrompt);
        if (goalPrompt) parts.push(goalPrompt);
        if (settings.agent_context) {
          parts.push("Instrucciones adicionales del administrador:\n" + settings.agent_context);
        }
        if (settings.booking_url) {
          parts.push(
            `Para agendar la cita comparte este enlace de agenda: ${settings.booking_url}\n` +
              `No compartas el enlace en el primer mensaje; primero entiende la necesidad del cliente.`
          );
        }
        if (parts.length > 0) {
          brandContext =
            "\n\n## Perfil y misión para ESTA empresa (definido por el administrador)\n" +
            parts.join("\n\n");
        }
      }
    }
  } catch (e) {
    console.warn("[chatbot] brand context lookup failed:", e);
  }

  // Intervalo de respuesta configurable por empresa: espera antes de contestar
  // para una sensación más humana (0 = inmediato; tope 300s por serverless).
  if (responseDelaySeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, responseDelaySeconds * 1000));
  }

  let rawResponse: string;
  try {
    rawResponse = await generateAIResponse({
      systemPrompt: agentConfig.system_prompt + brandContext + actionInstructions,
      conversationHistory: chatHistory,
      knowledgeBase: knowledgeParts.length > 0 ? knowledgeParts.join("\n\n") : undefined,
      maxTokens: agentConfig.max_tokens,
    });
  } catch (error) {
    console.error("AI call failed:", error);
    return false;
  }

  // Sin texto de la IA no hay nada que enviar (evita crash y mensajes vacíos).
  if (!rawResponse || !rawResponse.trim()) {
    console.warn("[chatbot] respuesta de IA vacía; no se envía nada");
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

  // Enviar la respuesta por el canal correcto (WhatsApp/Messenger/Instagram).
  const { getOutboundSender } = await import("@/lib/chatbot/outbound");
  const sender = context.channelId ? await getOutboundSender(context.channelId) : null;
  if (!sender) {
    console.error("[chatbot] sin emisor para el canal", context.channelId);
    return false;
  }
  const result = (await sender.sendText(context.contactWaId, cleanText)) as {
    messages?: Array<{ id?: string }>;
  };

  await admin.from("messages").insert({
    conversation_id: context.conversationId,
    direction: "outbound",
    type: "text",
    content: { type: "text", text: cleanText },
    wa_message_id: result?.messages?.[0]?.id,
    status: "sent",
    is_bot: true,
  });

  // Catálogo / brochure: se envía una sola vez por conversación, según el modo
  // configurado por la empresa. 'after_greeting' en la primera respuesta;
  // 'on_request' cuando el cliente lo pide (catálogo, brochure, precios, info).
  let brochureSent = false;
  if (brochure) {
    const asked = /cat[aá]logo|brochure|folleto|portafolio|precios?|informaci[oó]n|servicios?/i.test(
      context.messageText
    );
    const shouldSend =
      (brochure.mode === "after_greeting" && turnCount === 0) ||
      (brochure.mode === "on_request" && asked);
    if (shouldSend) {
      const { data: convFlag } = await admin
        .from("conversations")
        .select("metadata")
        .eq("id", context.conversationId)
        .maybeSingle();
      const already = (convFlag?.metadata as { brochure_sent?: boolean })?.brochure_sent === true;
      if (!already) {
        try {
          const isPdf = /\.pdf($|\?)/i.test(brochure.url) || /pdf/i.test(brochure.filename);
          await sender.sendMedia(
            context.contactWaId,
            isPdf ? "document" : "image",
            brochure.url,
            brochure.filename
          );
          await admin.from("messages").insert({
            conversation_id: context.conversationId,
            direction: "outbound",
            type: isPdf ? "document" : "image",
            content: { type: isPdf ? "document" : "image", url: brochure.url, filename: brochure.filename },
            status: "sent",
            is_bot: true,
          });
          brochureSent = true;
        } catch (e) {
          console.error("[chatbot] brochure send failed:", e);
        }
      }
    }
  }

  await admin
    .from("conversations")
    .update({
      metadata: {
        ai_turn_count: turnCount + 1,
        ai_agent_id: agentConfig.id,
        ...(brochureSent ? { brochure_sent: true } : {}),
      },
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
