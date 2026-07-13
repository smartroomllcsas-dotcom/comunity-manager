// Búsqueda de contactos por organización. Bearer $CRON_SECRET.
// GET /api/inbox/contacts/search?organization_id=X&q=term
// Busca por name/wa_id (ilike) y tags (array contains). Top 25.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RESULT_LIMIT = 25;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const orgId = url.searchParams.get("organization_id");
  const q = (url.searchParams.get("q") || "").trim();

  if (!orgId) {
    return NextResponse.json({ error: "organization_id requerido" }, { status: 400 });
  }
  if (q.length < 2) {
    return NextResponse.json({ error: "q debe tener al menos 2 caracteres" }, { status: 400 });
  }

  const admin = createAdminClient("smarttalk");
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const { data, error } = await admin
    .from("contacts")
    .select("id, name, wa_id, profile_picture_url, tags, last_message_at")
    .eq("organization_id", orgId)
    .or(`name.ilike.${like},wa_id.ilike.${like}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(RESULT_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    q,
    count: data?.length ?? 0,
    contacts: data ?? [],
  });
}
