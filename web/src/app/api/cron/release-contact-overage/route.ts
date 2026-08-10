import { NextRequest } from "next/server";
import { releaseContactOverageEvents } from "@/lib/smarttalk/contact-overage-release";
import { billingError } from "@/lib/billing/log";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await releaseContactOverageEvents({
      limit: 50,
    });
    return Response.json({ ok: true, ...result, processedAt: new Date().toISOString() });
  } catch (error) {
    // Libera cupo de contactos: es dominio de billing, así que registra con la
    // misma trazabilidad. El lote no tiene id propio, así que se nombra.
    billingError("contact_overage_release_failed", {
      correlationId: "contact-overage-release:batch",
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Contact overage release failed" },
      { status: 500 },
    );
  }
}
