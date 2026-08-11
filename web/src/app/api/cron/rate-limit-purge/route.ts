/**
 * GET /api/cron/rate-limit-purge — borra hits de rate limit fuera de retención.
 *
 * Parte de H-09: `smarttalk.rate_limit_hits` crecía sin límite porque nadie la
 * purgaba, y cada comprobación de rate limit hace un `COUNT` sobre ella.
 *
 * Se registra en `vercel.json` con ejecución horaria para mantener acotada la
 * tabla y el coste del COUNT usado por las comprobaciones.
 */
import { NextRequest } from "next/server";
import { RATE_LIMIT_RETENTION_MS, purgeRateLimitHits } from "@/lib/rate-limit";
import { billingError, billingLog } from "@/lib/billing/log";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await purgeRateLimitHits(RATE_LIMIT_RETENTION_MS);
    const processedAt = new Date().toISOString();

    if (!result.ok) {
      billingError("rate_limit_purge_failed", {
        correlationId: "rate-limit-purge:batch",
        message: result.error,
      });
      return Response.json({ error: result.error, code: "PURGE_FAILED" }, { status: 500 });
    }

    billingLog("info", "rate_limit_purge_summary", {
      correlationId: "rate-limit-purge:batch",
      purged: result.purged,
      retentionMs: RATE_LIMIT_RETENTION_MS,
      durationMs: Date.now() - startedAt,
      processedAt,
    });

    return Response.json({ ok: true, purged: result.purged, processedAt });
  } catch (error) {
    billingError("rate_limit_purge_unhandled_error", {
      correlationId: "rate-limit-purge:batch",
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
