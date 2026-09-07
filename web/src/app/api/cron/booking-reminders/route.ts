/** Cron (cada 5 min): recordatorio de reunión por WhatsApp N minutos antes de la cita. */
import { NextRequest, NextResponse } from "next/server";
import { runBookingReminders } from "@/lib/whatsapp/cloud/booking-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runBookingReminders();
  return NextResponse.json({ ok: true, ...result });
}
