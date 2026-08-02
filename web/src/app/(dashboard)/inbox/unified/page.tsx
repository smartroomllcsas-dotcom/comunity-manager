/**
 * Sprint 26 · Inbox unificado (server component).
 *
 * Layout de 3 columnas: [Sidebar filtros] [Conversations] [Thread + Contact].
 * Combina cm_mentions (Sprint 25) + smarttalk conversations en una sola vista.
 *
 * La ruta canónica /inbox sigue apuntando a la bandeja smarttalk clásica.
 * Esta ruta (/inbox/unified) es el inbox cross-source de Sprint 26.
 */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { InboxView } from "@/components/inbox/InboxView";

export const dynamic = "force-dynamic";

export default async function UnifiedInboxPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Inicia sesión para ver la bandeja unificada.
      </div>
    );
  }

  // Carga lazy de la lista de clientes visibles para el user. Reutilizamos
  // cm_clients.user_id como filtro simple. El component client hace el resto
  // vía /api/inbox.
  const { data: clients } = await supabase
    .from("cm_clients")
    .select("id, name, language")
    .order("name", { ascending: true });

  return (
    <div className="h-[calc(100vh-48px)] w-full">
      <InboxView
        initialClients={(clients ?? []).map((c) => ({
          id: (c as { id: string }).id,
          name: (c as { name: string }).name,
          language: (c as { language: string | null }).language,
        }))}
      />
    </div>
  );
}
