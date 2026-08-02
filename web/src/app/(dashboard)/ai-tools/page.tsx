// Sprint 25 · IA aplicada v2 — demo page para Content Generator, Repurpose,
// Draft Response. Server wrapper con auth check; renderiza el cliente
// interactivo con los 3 tabs.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AIToolsClient from "./AIToolsClient";

export const dynamic = "force-dynamic";

export default async function AIToolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#e6edf3]">
          IA aplicada · Sprint 25
        </h1>
        <p className="text-sm text-[#8b949e] mt-1">
          Generación multi-canal, repurposing long → short, y drafting de respuestas
          con voz del cliente. Todo con transparency de costo.
        </p>
      </header>
      <AIToolsClient />
    </div>
  );
}
