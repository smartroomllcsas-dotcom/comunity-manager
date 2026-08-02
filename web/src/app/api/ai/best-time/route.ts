/**
 * Sprint 25 · GET /api/ai/best-time
 *
 * Sugerencia de hora óptima. Query params: clientId, platform, dayOfWeek?
 * Auth + rate limit 30/min por user.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { suggestBestTime } from "@/lib/ai/best-time";

const AI_RATE_LIMIT = 30;
const AI_RATE_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`ai-best-time:${user.id}`, AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const url = new URL(request.url);
  const clientId = (url.searchParams.get("clientId") || "").trim();
  const platform = (url.searchParams.get("platform") || "").trim();
  const dayOfWeekRaw = url.searchParams.get("dayOfWeek");

  if (!clientId) return Response.json({ error: "clientId requerido" }, { status: 400 });
  if (!platform) return Response.json({ error: "platform requerido" }, { status: 400 });

  let dayOfWeek: number | undefined;
  if (dayOfWeekRaw !== null) {
    const parsed = Number(dayOfWeekRaw);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
      dayOfWeek = parsed;
    } else {
      return Response.json({ error: "dayOfWeek debe ser 0-6" }, { status: 400 });
    }
  }

  try {
    const result = await suggestBestTime(clientId, platform, dayOfWeek);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ai/best-time] Error:", msg);
    return Response.json({ error: `best-time failed: ${msg}` }, { status: 500 });
  }
}
