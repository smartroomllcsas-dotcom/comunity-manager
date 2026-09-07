/** Cron (cada hora): retoma automática de conversaciones de WhatsApp sin respuesta. */
import { NextRequest, NextResponse } from "next/server";
import { runReengagement } from "@/lib/whatsapp/cloud/reengage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runReengagement();
  return NextResponse.json({ ok: true, ...result });
}
