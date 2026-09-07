import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, sendInteractive, getOrgWhatsAppCredentials } from "@/lib/whatsapp/api";
import { processWithAI, processWithAIAgent } from "./ai";
import type { ChatbotFlowNode, AIActionConfig } from "@/types/database";

interface FlowContext {
  conversationId: string;
  contactWaId: string;
  contactId?: string;
  organizationId: string;
  messageText: string;
  channelId?: string;
}

async function sendFixedReplyIfMatches(
  admin: ReturnType<typeof createAdminClient>,
  context: FlowContext,
  brandId: string,
): Promise<boolean> {
  const { data: channel } = await admin
    .from("channels")
    .select("type")
    .eq("id", context.channelId!)
    .maybeSingle();
  const { channelKindForType } = await import("@/lib/whatsapp/cloud/channel-instructions");
  const kind = channelKindForType((channel as { type?: string } | null)?.type);
  if (!kind) return false;
  const { getFixedReplies, matchFixedReply } = await import("@/lib/whatsapp/cloud/fixed-replies");
  const rules = (await getFixedReplies(brandId))[kind];
  if (!rules?.length) return false;

  const { data: previous } = await admin
    .from("messages")
    .select("direction, is_bot, content")
    .eq("conversation_id", context.conversationId)
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = (previous || []) as Array<{ direction: string; is_bot: boolean | null; content?: { text?: string } | null }>;
  const textOf = (m: { content?: { text?: string } | null }) => String((m.content || {}).text || "");
  const previousTexts = rows.filter((m) => m.direction === "inbound").map(textOf);
  const previousBotTexts = rows.filter((m) => m.direction === "outbound").map(textOf);
  const reply = matchFixedReply(rules, context.messageText, previousTexts, previousBotTexts);
  if (!reply) return false;

  const { getOutboundSender } = await import("@/lib/chatbot/outbound");
  const sender = await getOutboundSender(context.channelId!);
  if (!sender) return false;
  const result = (await sender.sendText(context.contactWaId, reply)) as { messages?: Array<{ id?: string }> };
  await admin.from("messages").insert({
    conversation_id: context.conversationId,
    direction: "outbound",
    type: "text",
    content: { type: "text", text: reply },
    wa_message_id: result?.messages?.[0]?.id,
    status: "sent",
    is_bot: true,
  });
  await admin
    .from("conversations")
    .update({ last_message_preview: reply.slice(0, 100), updated_at: new Date().toISOString() })
    .eq("id", context.conversationId);
  return true;
}

export async function processIncomingWithChatbot(context: FlowContext): Promise<boolean> {
  const admin = createAdminClient();

  const { data: conversation } = await admin
    .from("conversations")
    .select("metadata, contact_id, brand_id")
    .eq("id", context.conversationId)
    .single();
  const metadata = (conversation?.metadata || {}) as {
    active_flow_id?: string;
    current_node_id?: string;
    ai_turn_count?: number;
    ai_agent_id?: string;
  };
  const contactId = context.contactId || conversation?.contact_id;
  // Marca (empresa) del lead: define QUÉ agente responde. Modelo de agencia:
  // cada empresa tiene su propio agente; nunca se usa el de otra empresa.
  const brandId = (conversation as { brand_id?: string | null } | null)?.brand_id ?? null;

  // "No quiero que me contacten": se marca sí o sí (bandera + Perdido + nota)
  // y el agente no insiste; queda fuera de sincronización y retoma.
  if (contactId && context.messageText) {
    try {
      const { looksLikeOptOut, markDoNotContact } = await import("@/lib/smarttalk/do-not-contact");
      if (looksLikeOptOut(context.messageText)) {
        await markDoNotContact(admin, {
          contactId,
          organizationId: context.organizationId,
          conversationId: context.conversationId,
          reason: context.messageText,
        });
        return false;
      }
    } catch (e) {
      console.error("[chatbot] no-contactar falló:", e);
    }
  }

  // Respuestas fijas por canal (texto exacto exigido por la empresa, sin IA).
  if (brandId && context.channelId && context.messageText?.trim()) {
    try {
      const fixed = await sendFixedReplyIfMatches(admin, { ...context, contactId }, brandId);
      if (fixed) return true;
    } catch (e) {
      console.error("[chatbot] respuesta fija falló:", e);
    }
  }

  // Continue active flow
  if (metadata.active_flow_id && metadata.current_node_id) {
    const { data: flow } = await admin
      .from("chatbot_flows")
      .select("*")
      .eq("id", metadata.active_flow_id)
      .eq("is_active", true)
      .single();
    if (flow) {
      return await executeFlowNode(
        flow.flow_data.nodes,
        metadata.current_node_id,
        { ...context, contactId },
        metadata
      );
    }
  }

  // Check trigger-matching flows
  const { data: flows } = await admin
    .from("chatbot_flows")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true);
  if (!flows) return false;

  for (const flow of flows) {
    const nodes = flow.flow_data.nodes as ChatbotFlowNode[];
    if (nodes.length === 0) continue;
    let triggered = false;

    switch (flow.trigger_type) {
      case "first_message": {
        const { count } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", context.conversationId)
          .eq("direction", "inbound");
        triggered = (count || 0) <= 1;
        break;
      }
      case "keyword":
        triggered = context.messageText
          .toLowerCase()
          .includes((flow.trigger_value || "").toLowerCase());
        break;
      case "menu_option":
        triggered = context.messageText === flow.trigger_value;
        break;
    }

    if (triggered) {
      await admin
        .from("conversations")
        .update({
          metadata: {
            ...metadata,
            active_flow_id: flow.id,
            current_node_id: nodes[0].id,
          },
        })
        .eq("id", context.conversationId);
      return await executeFlowNode(nodes, nodes[0].id, { ...context, contactId }, {
        ...metadata,
        active_flow_id: flow.id,
      });
    }
  }

  // Selección de agente POR EMPRESA (modelo de agencia).
  // 1) Agente propio de la marca del lead (prioridad al predeterminado de esa marca).
  // 2) Si la marca no tiene agente propio, sólo se usa un agente SIN marca
  //    (brand_id NULL) marcado como general — NUNCA el agente de otra empresa,
  //    para evitar que un lead de una marca reciba respuestas de otra.
  const runAgent = (row: {
    id: string;
    system_prompt: string;
    actions?: AIActionConfig[];
    max_tokens?: number;
  }) =>
    processWithAIAgent(
      { ...context, contactId },
      {
        id: row.id,
        system_prompt: row.system_prompt,
        actions: row.actions || [],
        max_tokens: row.max_tokens || 1024,
      },
      metadata.ai_turn_count || 0
    );

  if (brandId) {
    const { data: brandAgent } = await admin
      .from("ai_agents")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (brandAgent) return await runAgent(brandAgent);
  }

  // Agente general SIN marca (opcional): sólo si está marcado explícitamente
  // como predeterminado y no tiene brand_id. No filtra a ninguna empresa.
  const { data: generalAgent } = await admin
    .from("ai_agents")
    .select("*")
    .eq("organization_id", context.organizationId)
    .is("brand_id", null)
    .eq("is_active", true)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  if (generalAgent) return await runAgent(generalAgent);

  // Fallback to legacy ai_config
  const { data: aiConfig } = await admin
    .from("ai_config")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true)
    .single();
  if (aiConfig) return await processWithAI(context, aiConfig, metadata.ai_turn_count || 0);

  return false;
}

async function executeFlowNode(
  nodes: ChatbotFlowNode[],
  nodeId: string,
  context: FlowContext & { contactId?: string },
  metadata: Record<string, unknown>
): Promise<boolean> {
  const admin = createAdminClient();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  const { phoneNumberId, accessToken } = await getOrgWhatsAppCredentials(
    context.organizationId,
    context.channelId
  );

  switch (node.type) {
    case "message": {
      const result = await sendText({
        to: context.contactWaId,
        text: node.content || "",
        phoneNumberId,
        accessToken,
      });
      await admin.from("messages").insert({
        conversation_id: context.conversationId,
        direction: "outbound",
        type: "text",
        content: { type: "text", text: node.content || "" },
        wa_message_id: result.messages[0]?.id,
        status: "sent",
        is_bot: true,
      });
      if (node.next) {
        await admin
          .from("conversations")
          .update({ metadata: { ...metadata, current_node_id: node.next } })
          .eq("id", context.conversationId);
        const nextNode = nodes.find((n) => n.id === node.next);
        if (nextNode && nextNode.type !== "menu" && nextNode.type !== "condition") {
          return await executeFlowNode(nodes, node.next, context, metadata);
        }
      } else {
        await clearFlowState(context.conversationId, metadata);
      }
      return true;
    }
    case "menu": {
      const buttons = (node.options || [])
        .slice(0, 3)
        .map((opt, i) => ({ id: `option_${i}`, title: opt.label }));
      const result = await sendInteractive({
        to: context.contactWaId,
        interactiveType: "button",
        body: node.content || "Selecciona una opcion:",
        buttons,
        phoneNumberId,
        accessToken,
      });
      await admin.from("messages").insert({
        conversation_id: context.conversationId,
        direction: "outbound",
        type: "interactive",
        content: {
          type: "interactive",
          interactive_type: "button",
          body: node.content || "Selecciona una opcion:",
          buttons,
        },
        wa_message_id: result.messages[0]?.id,
        status: "sent",
        is_bot: true,
      });
      return true;
    }
    case "condition": {
      const matched = context.messageText
        .toLowerCase()
        .includes((node.keyword || "").toLowerCase());
      const nextId = matched ? node.match_next : node.no_match_next;
      if (nextId) return await executeFlowNode(nodes, nextId, context, metadata);
      await clearFlowState(context.conversationId, metadata);
      return false;
    }
    case "assign_agent": {
      await clearFlowState(context.conversationId, metadata);
      return false;
    }
    case "ai_handoff": {
      await clearFlowState(context.conversationId, metadata);

      // Try new AI agents system first
      const { data: defaultAgent } = await admin
        .from("ai_agents")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .eq("is_default", true)
        .single();

      if (defaultAgent) {
        return await processWithAIAgent(
          context,
          {
            id: defaultAgent.id,
            system_prompt: defaultAgent.system_prompt,
            actions: defaultAgent.actions || [],
            max_tokens: defaultAgent.max_tokens || 1024,
          },
          0
        );
      }

      // Fallback to legacy
      const { data: aiConfig } = await admin
        .from("ai_config")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .single();
      if (aiConfig) return await processWithAI(context, aiConfig, 0);
      return false;
    }
    default:
      return false;
  }
}

async function clearFlowState(
  conversationId: string,
  metadata: Record<string, unknown>
) {
  const admin = createAdminClient();
  const { active_flow_id, current_node_id, ...rest } = metadata;
  await admin
    .from("conversations")
    .update({ metadata: rest })
    .eq("id", conversationId);
}
