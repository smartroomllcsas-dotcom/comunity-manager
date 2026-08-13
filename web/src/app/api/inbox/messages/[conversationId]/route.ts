import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessibleConversation } from "@/lib/smarttalk/brand-scope";
import { sanitizeAttachmentForClient } from "@/lib/inbox/attachments";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
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
    .select("id, organization_id, member_type")
    .eq("id", user.id)
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const conversation = await getAccessibleConversation(agent, conversationId);

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if ((conversation.contact as { visibility_status?: string } | null)?.visibility_status === "restricted") {
    return NextResponse.json({ error: "Contact restricted", message: "Amplía el plan para ver los mensajes" }, { status: 402 });
  }

  const { data, error } = await admin
    .from("messages")
    .select("*, agent:agents(id, name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    messages: (data ?? []).map((message) => ({
      ...message,
      content: sanitizeAttachmentForClient(message.content),
    })),
  });
}
