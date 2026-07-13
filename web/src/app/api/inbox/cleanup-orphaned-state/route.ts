// Housekeeping: borra rows de inbox_sync_state cuya organization_id ya no existe.
// POST con Bearer $CRON_SECRET. Idempotente. Devuelve count.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient("smarttalk");

  // Traer todas las orgs vivas para excluirlas.
  const { data: orgs, error: orgsErr } = await admin.from("organizations").select("id");
  if (orgsErr) return NextResponse.json({ error: orgsErr.message }, { status: 500 });

  const aliveOrgIds = new Set((orgs ?? []).map((o) => o.id as string));

  const { data: states, error: statesErr } = await admin
    .from("inbox_sync_state")
    .select("organization_id, resource");
  if (statesErr) return NextResponse.json({ error: statesErr.message }, { status: 500 });

  const orphaned = (states ?? []).filter((s) => !aliveOrgIds.has(s.organization_id as string));

  if (orphaned.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, checked: states?.length ?? 0 });
  }

  let deleted = 0;
  const errors: string[] = [];
  for (const row of orphaned) {
    const { error } = await admin
      .from("inbox_sync_state")
      .delete()
      .eq("organization_id", row.organization_id)
      .eq("resource", row.resource);
    if (error) errors.push(`${row.organization_id}:${error.message}`);
    else deleted += 1;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    deleted,
    checked: states?.length ?? 0,
    orphanedFound: orphaned.length,
    errors: errors.slice(0, 5),
  });
}
