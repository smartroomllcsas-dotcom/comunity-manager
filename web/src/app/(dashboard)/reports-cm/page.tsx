// Sprint 26 · Agente P — Página /reports-cm (server component).
//
// Nota: existe ya un /reports (SmartTalk messaging analytics). Este es el
// generador de PDFs branded para agencia CM — se aloja en /reports-cm para
// no colisionar. Chequea sesión Supabase; si no hay user → /login.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReportBuilder from "@/components/reports/ReportBuilder";

export const dynamic = "force-dynamic";

export default async function ReportsCmPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <ReportBuilder />;
}
