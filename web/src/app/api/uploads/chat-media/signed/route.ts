import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MEDIA_BUCKET = "chat-media";
const DEFAULT_TTL_SECONDS = 60 * 60; // 1h para lecturas puntuales

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, organization_id")
    .eq("id", user.id)
    .single();
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    paths?: string[];
    ttlSeconds?: number;
  };

  const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === "string") : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "paths requerido" }, { status: 400 });
  }

  // Cada path debe empezar con el organization_id del agente para evitar
  // que un agente firme media de otro tenant.
  const orgPrefix = `${agent.organization_id}/`;
  const invalid = paths.find((p) => !p.startsWith(orgPrefix));
  if (invalid) {
    return NextResponse.json({ error: "Path fuera de organización" }, { status: 403 });
  }

  const ttl = Math.min(Math.max(Number(body.ttlSeconds) || DEFAULT_TTL_SECONDS, 60), 60 * 60 * 24);

  const { data, error } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, ttl);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    urls: (data ?? []).map((entry) => ({
      path: entry.path,
      url: entry.signedUrl,
      error: entry.error ?? null,
    })),
    expiresIn: ttl,
  });
}
