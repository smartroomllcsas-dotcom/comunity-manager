// Sprint 24 · Composer — server wrapper.
// Server-side:
//  * Verifica sesión Supabase (redirect a /login si falta).
//  * Prefetch de clientes del usuario para pasar como initialClients.
//    FIXME(sprint-24): cuando /api/clients y el modelo multi-tenant
//    definitivo existan, mover este query a un helper compartido.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostEditor, { type ClientOption } from "@/components/post-editor/PostEditor";

export const dynamic = "force-dynamic";

async function loadClientsForUser(): Promise<ClientOption[]> {
  try {
    const supabase = await createClient();
    // El schema default del server client es `smarttalk`. La tabla real de
    // clientes de CM vive en `public.cm_clients`. Si no responde, el hook
    // cliente reintenta contra /api/cm/clients (sin mocks).
    const { data } = await supabase
      .schema("public")
      .from("cm_clients")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(50);
    if (Array.isArray(data)) {
      return data
        .filter((c): c is { id: string; name: string } =>
          !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string",
        )
        .map((c) => ({ id: c.id, name: c.name ?? "Sin nombre" }));
    }
  } catch {
    // fall-through
  }
  return [];
}

export default async function ComposerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clients = await loadClientsForUser();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#e6edf3]">Composer</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          Redacta una vez, previsualiza en cada canal, programa cuando estés listo.
        </p>
      </header>
      <PostEditor initialClients={clients} />
    </div>
  );
}
