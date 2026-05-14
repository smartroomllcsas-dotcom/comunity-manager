import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
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

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return Response.json({ error: "conversationId is required" }, { status: 400 });
  }

  // Verify conversation belongs to agent's org
  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: notes, error } = await admin
    .from("internal_notes")
    .select("*, agent:agents(id, name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ notes: notes || [] });
}

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

  const { conversationId, content } = await request.json();
  if (!conversationId || !content?.trim()) {
    return Response.json({ error: "conversationId and content are required" }, { status: 400 });
  }

  // Verify conversation belongs to agent's org
  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("organization_id", agent.organization_id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: note, error } = await admin
    .from("internal_notes")
    .insert({
      conversation_id: conversationId,
      agent_id: agent.id,
      content: content.trim(),
    })
    .select("*, agent:agents(id, name)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ note });
}
