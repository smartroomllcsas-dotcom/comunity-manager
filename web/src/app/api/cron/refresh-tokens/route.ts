import { NextRequest } from "next/server";
import { refreshExpiringTokens } from "@/lib/whatsapp/token-manager";

// Vercel Cron or external cron calls this endpoint daily
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshExpiringTokens();
    return Response.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Token refresh failed" },
      { status: 500 }
    );
  }
}
