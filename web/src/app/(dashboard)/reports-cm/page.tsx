// Sprint 26 · Agente P — Página /reports-cm (server component).
//
// Nota: existe ya un /reports (SmartTalk messaging analytics). Este es el
// generador de PDFs branded para agencia CM — se aloja en /reports-cm para
// no colisionar. Chequea sesión Supabase; si no hay user → /login.

import { redirect } from "next/navigation";
import { resolvePageIdentity } from "@/lib/auth/page-identity";
import ReportBuilder from "@/components/reports/ReportBuilder";

export const dynamic = "force-dynamic";

export default async function ReportsCmPage() {
  // Sirve cualquiera de los dos logins de la plataforma.
  if (!(await resolvePageIdentity())) redirect("/login");
  return <ReportBuilder />;
}
