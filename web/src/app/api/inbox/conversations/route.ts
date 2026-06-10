import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInstagramInboxForOrganization } from "@/lib/smarttalk/instagram-sync";

const instagramSyncTimestamps = new Map<string, number>();
const instagramSyncPromises = new Map<string, Promise<void>>();
const INSTAGRAM_SYNC_INTERVAL_MS = 45_000;

function triggerInstagramSync(organizationId: string) {
  const lastInstagramSync = instagramSyncTimestamps.get(organizationId) || 0;
  if (Date.now() - lastInstagramSync <= INSTAGRAM_SYNC_INTERVAL_MS) return;
  if (instagramSyncPromises.has(organizationId)) return;

  instagramSyncTimestamps.set(organizationId, Date.now());
  const syncPromise = syncInstagramInboxForOrganization(organizationId)
    .then((instagramSync) => {
      if (instagramSync.errors.length > 0) {
        console.warn("[inbox] instagram sync warnings", instagramSync);
      }
    })
    .catch((error) => {
      console.warn("[inbox] instagram sync failed", error instanceof Error ? error.message : error);
    })
    .finally(() => {
      instagramSyncPromises.delete(organizationId);
    });

  instagramSyncPromises.set(organizationId, syncPromise);
}

export async function GET() {
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

  triggerInstagramSync(agent.organization_id);

  const { data, error } = await admin
    .from("conversations")
    .select("*, contact:contacts(*), channel:channels(id,type,name,status,whatsapp_phone_number,whatsapp_phone_number_id,whatsapp_business_account_id,config,connected_at,last_active_at,token_expires_at)")
    .eq("organization_id", agent.organization_id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const conversations = (data ?? []).filter((conversation) => {
    const metadata = conversation.metadata as Record<string, unknown> | null;
    return !metadata?.merged_into;
  });

  return NextResponse.json({ conversations });
}
