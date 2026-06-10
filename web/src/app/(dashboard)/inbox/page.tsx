import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Channel, Conversation } from "@/types/database";
import { InboxClient } from "@/components/inbox/InboxClient";

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
    .select("id, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!agent) {
    return <InboxClient initialConversations={[]} initialChannels={[]} />;
  }

  const [conversationsRes, channelsRes] = await Promise.all([
    admin
      .from("conversations")
      .select("*, contact:contacts(*), channel:channels(id,type,name,status,whatsapp_phone_number,whatsapp_phone_number_id,whatsapp_business_account_id,config,connected_at,last_active_at,token_expires_at)")
      .eq("organization_id", agent.organization_id)
      .order("updated_at", { ascending: false })
      .limit(50),
    admin
      .from("channels")
      .select("*")
      .eq("organization_id", agent.organization_id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <InboxClient
      initialConversations={(conversationsRes.data || []) as Conversation[]}
      initialChannels={(channelsRes.data || []) as Channel[]}
    />
  );
}
