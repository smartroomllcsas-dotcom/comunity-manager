import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRespondIoToken } from "@/lib/respond-io/api";
import type { RespondIoChannelSource } from "@/lib/respond-io/types";

interface ConnectBody {
  name: string;
  apiToken: string;
  respondChannelId: string;
  respondChannelType: RespondIoChannelSource;
  workspaceId?: string;
  displayName?: string;
  webhookSecret?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase.from("agents").select("*").eq("id", user.id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (agent.role !== "admin") {
    return NextResponse.json({ error: "Solo los administradores pueden conectar canales" }, { status: 403 });
  }

  const body = (await request.json()) as ConnectBody;
  const {
    name,
    apiToken,
    respondChannelId,
    respondChannelType,
    workspaceId,
    displayName,
    webhookSecret,
  } = body;

  if (!name || !apiToken || !respondChannelId || !respondChannelType) {
    return NextResponse.json(
      { error: "name, apiToken, respondChannelId y respondChannelType son requeridos" },
      { status: 400 },
    );
  }

  const verification = await verifyRespondIoToken(apiToken);
  if (!verification.ok) {
    return NextResponse.json(
      { error: `Token de Respond.io invalido: ${verification.error}` },
      { status: 400 },
    );
  }

  const config = {
    apiToken,
    respondChannelId,
    respondChannelType,
    workspaceId,
    displayName,
    webhookSecret,
  };

  const { data: channel, error } = await admin
    .from("channels")
    .insert({
      organization_id: agent.organization_id,
      type: "respond_io",
      name,
      status: "active",
      access_token: apiToken,
      respond_io_channel_id: respondChannelId,
      config,
      connected_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channel }, { status: 201 });
}
