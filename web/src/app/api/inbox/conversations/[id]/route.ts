import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationStatus } from "@/types/database";

type ConversationActionBody =
  | { action: "read" }
  | { action: "assign"; assignedAgentId: string | null }
  | { action: "status"; status: ConversationStatus }
  | { action: "close"; category?: string | null; notes?: string | null };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient("smarttalk");
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("organization_id", agent.organization_id)
    .maybeSingle();

  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as ConversationActionBody;
  const now = new Date().toISOString();

  let payload: Record<string, unknown> = { updated_at: now };

  switch (body.action) {
    case "read":
      payload = { ...payload, unread_count: 0 };
      break;
    case "assign":
      payload = { ...payload, assigned_agent_id: body.assignedAgentId ?? null };
      break;
    case "status":
      payload = {
        ...payload,
        status: body.status,
        resolved_at: body.status === "resolved" ? now : null,
        closed_by: body.status === "closed" ? user.id : null,
      };
      break;
    case "close":
      payload = {
        ...payload,
        status: "closed",
        closing_category: body.category ?? null,
        closing_notes: body.notes ?? null,
        closed_by: user.id,
      };
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("conversations")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: updated });
}
