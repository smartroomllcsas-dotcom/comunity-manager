/**
 * Sprint 25 · /listening - Community Listening + Brand Health.
 *
 * Server component:
 *   - Load user + org via smarttalk supabase.
 *   - Load cm_clients for the org (client picker).
 *   - Render <ListeningView> (client component) which fetches mentions +
 *     health series via /api/mentions and /api/mentions/health.
 */

import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { ListeningView } from "@/components/listening/ListeningView";

export const dynamic = "force-dynamic";

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase env missing");
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

type ClientOption = { id: string; name: string };

export default async function ListeningPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const sp = await searchParams;
  const smart = await createServerClient();
  const {
    data: { user },
  } = await smart.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await smart
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agent) redirect("/login");

  const admin = getPublicAdmin();
  const { data: clientsRaw } = await admin
    .from("cm_clients")
    .select("id, name, brand_name")
    .eq("organization_id", agent.organization_id)
    .order("name", { ascending: true });

  const clients: ClientOption[] = (clientsRaw ?? []).map(
    (c: { id: string; name?: string | null; brand_name?: string | null }) => ({
      id: c.id,
      name: c.brand_name || c.name || "Sin nombre",
    }),
  );

  const activeClientId =
    (sp.client_id && clients.find((c) => c.id === sp.client_id)?.id) ||
    clients[0]?.id ||
    null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Community Listening</h1>
        <p className="text-sm text-muted-foreground">
          Menciones cross-platform, sentiment analysis y brand health score
          en tiempo real.
        </p>
      </header>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-border bg-[#1a1f2e] p-8 text-center text-sm text-muted-foreground">
          Aun no tienes clientes con cuentas sociales conectadas. Ve a{" "}
          <a href="/channels" className="underline">
            Canales
          </a>{" "}
          para conectar Meta, LinkedIn, TikTok o Threads.
        </div>
      ) : (
        <ListeningView
          clients={clients}
          initialClientId={activeClientId!}
        />
      )}
    </div>
  );
}
