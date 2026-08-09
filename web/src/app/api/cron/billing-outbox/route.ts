import { NextRequest } from "next/server";
import { processBillingOutboxJobs } from "@/lib/billing/outbox";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processBillingOutboxJobs(25);
    return Response.json({ ok: true, ...result, processedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[cron/billing-outbox] failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Billing outbox failed" },
      { status: 500 },
    );
  }
}
