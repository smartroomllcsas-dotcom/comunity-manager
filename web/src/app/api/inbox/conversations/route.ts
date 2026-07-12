import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInstagramInboxForOrganization } from "@/lib/smarttalk/instagram-sync";

// Throttle serverless-safe. Persistimos el último sync en smarttalk.inbox_sync_state
// para que funcione entre workers Vercel (el Map local no basta).
const INSTAGRAM_SYNC_INTERVAL_MS = 45_000;
const INSTAGRAM_SYNC_RESOURCE = "instagram_inbox";

// Cache local complementaria: evita ir al DB en cada request dentro del mismo worker.
const localSyncTimestamps = new Map<string, number>();

function runSyncInBackground(organizationId: string) {
  syncInstagramInboxForOrganization(organizationId)
    .then((result) => {
      if (result.errors.length > 0) {
        console.warn("[inbox] instagram sync warnings", result);
      }
    })
    .catch((error) => {
      console.warn("[inbox] instagram sync failed", error instanceof Error ? error.message : error);
    });
}

async function triggerInstagramSync(organizationId: string) {
  // Fast-path local: si este worker ya sincronizó hace <45s, no vamos al DB.
  const localLast = localSyncTimestamps.get(organizationId) ?? 0;
  if (Date.now() - localLast <= INSTAGRAM_SYNC_INTERVAL_MS) return;

  const admin = createAdminClient("smarttalk");
  const now = new Date();
  const cutoff = new Date(now.getTime() - INSTAGRAM_SYNC_INTERVAL_MS).toISOString();
  const nowIso = now.toISOString();

  // Intento atómico #1: UPDATE si la fila existe y está stale.
  const { data: updated } = await admin
    .from("inbox_sync_state")
    .update({ last_synced_at: nowIso })
    .eq("organization_id", organizationId)
    .eq("resource", INSTAGRAM_SYNC_RESOURCE)
    .lt("last_synced_at", cutoff)
    .select("organization_id");

  if (updated && updated.length > 0) {
    localSyncTimestamps.set(organizationId, now.getTime());
    runSyncInBackground(organizationId);
    return;
  }

  // Intento #2: INSERT si no hay fila. ignoreDuplicates cierra la race con otro worker.
  const { data: inserted } = await admin
    .from("inbox_sync_state")
    .upsert(
      {
        organization_id: organizationId,
        resource: INSTAGRAM_SYNC_RESOURCE,
        last_synced_at: nowIso,
      },
      { onConflict: "organization_id,resource", ignoreDuplicates: true }
    )
    .select("organization_id");

  if (inserted && inserted.length > 0) {
    localSyncTimestamps.set(organizationId, now.getTime());
    runSyncInBackground(organizationId);
  }
}

type ConversationStatus = "open" | "pending" | "resolved" | "closed";
const STATUS_VALUES: readonly ConversationStatus[] = ["open", "pending", "resolved", "closed"];

function parseCursor(cursor: string | null): { updatedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof decoded?.updatedAt === "string" && typeof decoded?.id === "string") {
      return { updatedAt: decoded.updatedAt, id: decoded.id };
    }
  } catch {
    // ignore malformed cursor
  }
  return null;
}

function encodeCursor(updatedAt: string, id: string) {
  return Buffer.from(JSON.stringify({ updatedAt, id }), "utf8").toString("base64url");
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient("smarttalk");
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  void triggerInstagramSync(agent.organization_id).catch((error) => {
    console.warn("[inbox] instagram sync trigger failed", error instanceof Error ? error.message : error);
  });

  const searchParams = request.nextUrl.searchParams;
  const filter = searchParams.get("filter") || "all";
  const statusParam = searchParams.get("status");
  const channelParam = searchParams.get("channel");
  const search = (searchParams.get("search") || "").trim();
  const cursor = parseCursor(searchParams.get("cursor"));
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

  let query = admin
    .from("conversations")
    .select(
      "*, contact:contacts(*), channel:channels(id,type,name,status,whatsapp_phone_number,whatsapp_phone_number_id,whatsapp_business_account_id,config,connected_at,last_active_at,token_expires_at)"
    )
    .eq("organization_id", agent.organization_id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1); // +1 para detectar si hay siguiente página

  // Filtro por asignación / estado agrupado
  if (filter === "mine") {
    query = query.eq("assigned_agent_id", agent.id);
  } else if (filter === "unassigned") {
    query = query.is("assigned_agent_id", null);
  } else if ((STATUS_VALUES as readonly string[]).includes(filter)) {
    query = query.eq("status", filter);
  }

  // Filtro por estado explícito (adicional al `filter`)
  if (statusParam === "snoozed") {
    query = query.not("snoozed_until", "is", null);
  } else if (statusParam && statusParam !== "all" && (STATUS_VALUES as readonly string[]).includes(statusParam)) {
    query = query.eq("status", statusParam);
  }

  // Cursor: filas más viejas que el cursor. Postgres: (updated_at,id) < (cursor.updatedAt,cursor.id).
  if (cursor) {
    query = query.or(
      `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (data ?? []).filter((conversation) => {
    const metadata = conversation.metadata as Record<string, unknown> | null;
    return !metadata?.merged_into;
  });

  // Búsqueda por texto (server-side no soportada por Supabase sobre join sin RPC dedicado;
  // filtramos en memoria sobre la página actual — sigue siendo mejor que traer todo).
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter((conversation) => {
      const contact = conversation.contact as { name?: string | null; wa_id?: string | null } | null;
      return (
        (contact?.name || "").toLowerCase().includes(needle) ||
        (contact?.wa_id || "").toLowerCase().includes(needle) ||
        (conversation.last_message_preview || "").toLowerCase().includes(needle)
      );
    });
  }

  // Canal: se conserva client-side por ahora (usa una función de mapeo).
  // Cuando se estabilice el mapping, se puede materializar en columna.
  if (channelParam && channelParam !== "all") {
    rows = rows.filter((conversation) => {
      const channelType = (conversation.channel as { type?: string } | null)?.type;
      if (!channelType) return false;
      if (channelParam === "whatsapp") return channelType.startsWith("whatsapp");
      return channelType === channelParam;
    });
  }

  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasNextPage && last ? encodeCursor(last.updated_at, last.id) : null;

  return NextResponse.json({ conversations: page, nextCursor });
}
