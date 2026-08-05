import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Channel, Conversation } from "@/types/database";
import { InboxClient } from "@/components/inbox/InboxClient";
import { getAgentBrandIds } from "@/lib/smarttalk/brand-scope";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createServerClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <InboxClient initialConversations={[]} initialChannels={[]} />;
  }

  const { data: agent } = await admin
    .from("agents")
    .select("id, organization_id, member_type")
    .eq("id", user.id)
    .maybeSingle();

  if (!agent) {
    return <InboxClient initialConversations={[]} initialChannels={[]} />;
  }

  const assignedBrandIds = await getAgentBrandIds(agent);
  if (assignedBrandIds && assignedBrandIds.length === 0) {
    return <InboxClient initialConversations={[]} initialChannels={[]} />;
  }

  let conversationsQuery = admin
      .from("conversations")
      .select("*, contact:contacts(*), channel:channels(id,type,name,status,whatsapp_phone_number,whatsapp_phone_number_id,whatsapp_business_account_id,config,connected_at,last_active_at,token_expires_at)")
      .eq("organization_id", agent.organization_id)
      .order("updated_at", { ascending: false })
      .limit(50);
  let channelsQuery = admin
      .from("channels")
      .select("*")
      .eq("organization_id", agent.organization_id)
      .order("created_at", { ascending: false });

  if (assignedBrandIds) {
    conversationsQuery = conversationsQuery.in("brand_id", assignedBrandIds);
    channelsQuery = channelsQuery.in("brand_id", assignedBrandIds);
  }

  const [conversationsRes, channelsRes] = await Promise.all([
    conversationsQuery,
    channelsQuery,
  ]);

  const initialConversations = ((conversationsRes.data || []) as Conversation[]).filter((conversation) => {
    const channelType = (conversation.channel as { type?: string } | null)?.type;
    return channelType !== "instagram" || Boolean(conversation.last_message_preview);
  });

  return (
    <InboxClient
      initialConversations={initialConversations}
      initialChannels={(channelsRes.data || []) as Channel[]}
    />
  );
}
