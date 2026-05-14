import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAIResponse } from "@/lib/chatbot/ai";
import { processAIActions } from "@/lib/ai/actions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { data: aiAgent } = await admin
    .from("ai_agents")
    .select("*, knowledge_sources(*)")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!aiAgent) {
    return Response.json({ error: "Agente IA no encontrado" }, { status: 404 });
  }

  const { message, conversationHistory } = await request.json();

  if (!message?.trim()) {
    return Response.json({ error: "El mensaje es requerido" }, { status: 400 });
  }

  // Build knowledge base from sources
  const knowledgeParts: string[] = [];
  if (aiAgent.knowledge_sources) {
    for (const source of aiAgent.knowledge_sources) {
      if (source.content) {
        knowledgeParts.push(`[${source.name}]: ${source.content}`);
      }
    }
  }

  const history = [
    ...(conversationHistory || []),
    { role: "user" as const, content: message },
  ];

  try {
    // Build action instructions for the system prompt
    const enabledActions = (aiAgent.actions || []).filter((a: { enabled: boolean }) => a.enabled);
    let actionInstructions = "";
    if (enabledActions.length > 0) {
      actionInstructions = "\n\n## Acciones Disponibles\nPuedes ejecutar acciones incluyendo marcadores en tu respuesta. Usa el formato [ACTION:tipo] o [ACTION:tipo:parametro].\nAcciones disponibles:\n";
      for (const action of enabledActions) {
        switch (action.type) {
          case "close_conversation":
            actionInstructions += "- [ACTION:close_conversation] - Cerrar la conversacion cuando el problema este resuelto\n";
            break;
          case "assign_agent":
            actionInstructions += "- [ACTION:assign_agent:nombre] - Asignar a un agente humano\n";
            break;
          case "assign_team":
            actionInstructions += "- [ACTION:assign_team:nombre] - Asignar a un equipo\n";
            break;
          case "update_lifecycle":
            actionInstructions += "- [ACTION:update_lifecycle:etapa] - Actualizar la etapa del ciclo de vida del contacto\n";
            break;
          case "update_contact_field":
            actionInstructions += "- [ACTION:update_contact_field:campo:valor] - Actualizar un campo del contacto\n";
            break;
          case "update_tag":
            actionInstructions += "- [ACTION:update_tag:etiqueta] - Agregar una etiqueta al contacto\n";
            break;
          case "add_comment":
            actionInstructions += "- [ACTION:add_comment:texto] - Agregar un comentario interno\n";
            break;
          case "trigger_workflow":
            actionInstructions += "- [ACTION:trigger_workflow:nombre] - Activar un flujo de trabajo\n";
            break;
          case "http_request":
            actionInstructions += "- [ACTION:http_request] - Realizar una peticion HTTP configurada\n";
            break;
        }
        if (action.instructions) {
          actionInstructions += `  Instrucciones: ${action.instructions}\n`;
        }
      }
    }

    const rawResponse = await generateAIResponse({
      systemPrompt: aiAgent.system_prompt + actionInstructions,
      conversationHistory: history,
      knowledgeBase: knowledgeParts.length > 0 ? knowledgeParts.join("\n\n") : undefined,
      maxTokens: aiAgent.max_tokens,
    });

    const { cleanText, actions } = processAIActions(rawResponse);

    return Response.json({
      response: cleanText,
      actions: actions.map((a) => ({
        type: a.type,
        params: a.params,
        label: getActionLabel(a.type, a.params),
      })),
    });
  } catch (error) {
    console.error("AI test error:", error);
    return Response.json(
      { error: "Error al generar respuesta de IA" },
      { status: 500 }
    );
  }
}

function getActionLabel(type: string, params?: string[]): string {
  const labels: Record<string, string> = {
    close_conversation: "Cerrar conversacion",
    assign_agent: "Asignar a agente",
    assign_team: "Asignar a equipo",
    update_lifecycle: "Actualizar ciclo de vida",
    update_contact_field: "Actualizar campo de contacto",
    update_tag: "Actualizar etiqueta",
    add_comment: "Agregar comentario",
    trigger_workflow: "Activar flujo de trabajo",
    http_request: "Peticion HTTP",
  };
  const base = labels[type] || type;
  if (params && params.length > 0) return `${base}: ${params.join(", ")}`;
  return base;
}
