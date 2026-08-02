// Sprint 25 · Agente K — Server-component wrapper para el dashboard de analytics.
//
// Server-side: hace prefetch de /api/analytics?range=30d para paint inicial
// rápido, luego el AnalyticsDashboard client component se hidrata y re-fetchea
// on filter change.

import { headers, cookies } from "next/headers";
import AnalyticsDashboard, {
  type AnalyticsPayload,
} from "@/components/analytics/AnalyticsDashboard";

export const dynamic = "force-dynamic";

async function prefetchAnalytics(): Promise<AnalyticsPayload | null> {
  try {
    // Reconstruir la URL absoluta para el fetch server-side.
    const h = await headers();
    const proto = h.get("x-forwarded-proto") || "http";
    const host = h.get("host") || "localhost:3000";
    const base = `${proto}://${host}`;

    // Reenviar cookies para que /api/analytics vea la sesión Supabase.
    const cookieStr = (await cookies()).toString();
    const res = await fetch(`${base}/api/analytics?range=30d`, {
      headers: cookieStr ? { cookie: cookieStr } : undefined,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalyticsPayload;
  } catch {
    return null;
  }
}

export default async function AnalyticsPage() {
  const initial = await prefetchAnalytics();
  return <AnalyticsDashboard initial={initial} />;
}
