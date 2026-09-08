/** Cron (cada 5 min): arranca difusiones programadas y envía tandas según el cupo por hora. */
import { NextRequest, NextResponse } from "next/server";
import { processBroadcasts } from "@/lib/broadcasts/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processBroadcasts();
  return NextResponse.json({ ok: true, ...result });
}
