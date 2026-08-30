// Fusión OS (feat/os-unification): el dashboard canónico de analytics vive en
// /es/os/analytics (data real vía loadAnalytics). Esta ruta legacy redirige
// para mantener una sola implementación sin romper links existentes.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  redirect("/es/os/analytics");
}
