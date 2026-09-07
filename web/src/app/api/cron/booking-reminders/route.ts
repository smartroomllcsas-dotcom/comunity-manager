/** Cron (cada 5 min): recordatorio de reunión por WhatsApp N minutos antes de la cita. */
import { NextRequest, NextResponse } from "next/server";
import { runBookingReminders } from "@/lib/whatsapp/cloud/booking-reminder";
import { ensureUtilityFirstTouchTemplates } from "@/lib/whatsapp/cloud/first-touch-utility";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Aprovecha la misma pasada (el servidor tiene las credenciales de Meta)
  // para crear en Meta las plantillas Utility de primer contacto pendientes.
  const utility = await ensureUtilityFirstTouchTemplates();
  const result = await runBookingReminders();
  return NextResponse.json({ ok: true, ...result, utilityTemplates: utility });
}
