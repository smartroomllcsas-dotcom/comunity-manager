// Cron: reconcile stale WAHA sessions with live server state every 5 min.
// If a session hasn't been seen updated in the last 10 min, ask WAHA for
// its current status; on WORKING/FAILED/STOPPED, propagate to channels.status.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { wahaFromEnv, WahaError } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

const STALE_MINUTES = 10;
const BATCH_LIMIT = 100;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  const custom = request.headers.get("x-cron-secret");
  return custom === secret;
}

async function reconcile() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("waha_sessions")
    .select("id, session_name, channel_id")
    .lt("last_status_at", cutoff)
    .limit(BATCH_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // H3: cold-start guard — if WAHA env vars are missing, don't 500 the cron
  // (that would page an on-call). Fail-soft with 200 so it's observable but
  // doesn't trigger Vercel error alerts on every 5-min tick.
  let waha;
  try {
    waha = wahaFromEnv();
  } catch (envErr) {
    const msg = envErr instanceof Error ? envErr.message : String(envErr);
    console.error("[waha-watchdog] env missing, skipping reconcile:", msg);
    return NextResponse.json({ ok: false, skipped: true, reason: msg }, { status: 200 });
  }

  let checked = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const row of rows ?? []) {
    checked++;
    const sessionName = (row as { session_name: string }).session_name;
    const rowId = (row as { id: string }).id;
    const channelId = (row as { channel_id: string }).channel_id;
    try {
      const live = await waha.getSession(sessionName);
      const chStatus =
        live.status === "WORKING" ? "active" :
        live.status === "FAILED" || live.status === "STOPPED" ? "disconnected" :
        "pending";
      await admin
        .from("waha_sessions")
        .update({ status: live.status, last_status_at: now, last_error: null })
        .eq("id", rowId);
      await admin
        .from("channels")
        .update({ status: chStatus })
        .eq("id", channelId);
      updated++;
    } catch (e) {
      const msg = e instanceof WahaError ? e.message : (e as Error).message;
      await admin
        .from("waha_sessions")
        .update({ status: "FAILED", last_error: msg, last_status_at: now })
        .eq("id", rowId);
      await admin
        .from("channels")
        .update({ status: "disconnected" })
        .eq("id", channelId);
    }
  }

  return NextResponse.json({ ok: true, checked, updated });
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return reconcile();
}

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return reconcile();
}
