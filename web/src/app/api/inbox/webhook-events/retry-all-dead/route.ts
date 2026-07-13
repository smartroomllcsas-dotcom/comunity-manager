// Retry masivo de todos los webhook_events dead (status=failed AND attempts >= 3).
// POST con Bearer $CRON_SECRET (o X-Cron-Secret).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEAD_LETTER_ATTEMPTS = 3;

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
  const { data, error } = await admin
    .from("webhook_events")
    .update({ status: "pending", attempts: 0, last_error: null })
    .eq("status", "failed")
    .gte("attempts", DEAD_LETTER_ATTEMPTS)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    retried: data?.length ?? 0,
    ids: (data ?? []).map((row) => row.id),
  });
}
