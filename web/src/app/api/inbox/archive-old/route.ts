// Archive automático: marca como closed las conversations con status=resolved
// y updated_at < now - N días. POST con Bearer $CRON_SECRET.
// Ejecutable manualmente o vía Vercel Cron.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_DAYS = 90;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

async function runArchive(days: number) {
  const admin = createAdminClient("smarttalk");
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const { data, error } = await admin
    .from("conversations")
    .update({ status: "closed" })
    .eq("status", "resolved")
    .lt("updated_at", cutoff)
    .select("id");
  if (error) throw error;
  return { archived: data?.length ?? 0, cutoff };
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const parsedDays = Number(daysParam);
  const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : DEFAULT_DAYS;
  try {
    const result = await runArchive(days);
    return NextResponse.json({ ok: true, days, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "archive failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
