// Bulk close de conversations por org, filtrando por status previo y edad.
// POST con Bearer $CRON_SECRET.
// Body: {organization_id, status_from ('open'|'pending'|'resolved'), older_than_days}.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_STATUS_FROM = new Set(["open", "pending", "resolved"]);

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

  const body = (await request.json().catch(() => ({}))) as {
    organization_id?: string;
    status_from?: string;
    older_than_days?: number;
  };

  if (!body.organization_id || typeof body.organization_id !== "string") {
    return NextResponse.json({ error: "organization_id requerido" }, { status: 400 });
  }
  const statusFrom = String(body.status_from ?? "resolved").toLowerCase();
  if (!ALLOWED_STATUS_FROM.has(statusFrom)) {
    return NextResponse.json(
      { error: `status_from inválido. Permitidos: ${[...ALLOWED_STATUS_FROM].join(", ")}` },
      { status: 400 }
    );
  }
  const days = Math.max(0, Math.min(Number(body.older_than_days ?? 30), 365));
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("conversations")
    .update({ status: "closed" })
    .eq("organization_id", body.organization_id)
    .eq("status", statusFrom)
    .lt("updated_at", cutoff)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    organization_id: body.organization_id,
    status_from: statusFrom,
    older_than_days: days,
    cutoff,
    closed: data?.length ?? 0,
  });
}
