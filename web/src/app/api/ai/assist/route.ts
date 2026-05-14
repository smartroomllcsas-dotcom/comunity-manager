import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const { conversationId, messages } = await request.json();
  if (!conversationId || !messages?.length) {
    return Response.json({ error: "conversationId and messages are required" }, { status: 400 });
  }

  // Verify conversation belongs to agent's org
  const { data: conversation } = await admin
    .from("conversations")
    .select("*, contact:contacts(name, wa_id)")
    .eq("id", conversationId)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Check if org has AI config
  const { data: aiConfig } = await admin
    .from("ai_configs")
    .select("*")
    .eq("organization_id", agent.organization_id)
    .eq("is_active", true)
    .single();

  // Build messages for the AI
  const recentMessages = messages.slice(-10).map((msg: { direction: string; content: { type: string; text?: string } }) => ({
    role: msg.direction === "inbound" ? "user" as const : "assistant" as const,
    content: msg.content?.type === "text" ? msg.content.text || "" : `[${msg.content?.type || "message"}]`,
  }));

  const contactName = conversation.contact?.name || conversation.contact?.wa_id || "Cliente";
  const systemPrompt = aiConfig?.system_prompt ||
    `You are a helpful customer service assistant for a WhatsApp Business platform. Based on the conversation history, suggest a professional reply. Reply in the same language the customer is using. Be concise, friendly, and professional. The customer's name is ${contactName}.`;

  // Use Anthropic API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI not configured. Set ANTHROPIC_API_KEY." }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: aiConfig?.model || "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: systemPrompt,
        messages: recentMessages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", errBody);
      return Response.json({ error: "AI request failed" }, { status: 502 });
    }

    const result = await response.json();
    const suggestion = result.content?.[0]?.text || "";

    return Response.json({ suggestion });
  } catch (error) {
    console.error("AI assist error:", error);
    return Response.json({ error: "AI request failed" }, { status: 500 });
  }
}
