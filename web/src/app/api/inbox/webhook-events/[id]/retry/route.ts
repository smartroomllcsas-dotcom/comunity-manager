// Retry manual de un webhook_event específico.
// POST con Bearer $CRON_SECRET (o X-Cron-Secret). Resetea attempts=0 y status=pending
// para que el próximo run del cron lo tome.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("webhook_events")
    .update({ status: "pending", attempts: 0, last_error: null })
    .eq("id", id)
    .select("id, channel, status, attempts");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ retried: data[0] });
}
