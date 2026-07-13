// Auto-close de conversations idle (status=open, unread_count=0, updated_at >N días).
// Evita ruido en el inbox de conversaciones olvidadas. Bearer $CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_DAYS = 30;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const parsed = Number(url.searchParams.get("days"));
  const days = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 365) : DEFAULT_DAYS;
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const admin = createAdminClient("smarttalk");
  const { data, error } = await admin
    .from("conversations")
    .update({ status: "closed" })
    .eq("status", "open")
    .eq("unread_count", 0)
    .lt("updated_at", cutoff)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    days,
    cutoff,
    closed: data?.length ?? 0,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
