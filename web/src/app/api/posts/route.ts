// Sprint 24 · CRUD de drafts + programación de posts.
//
// GET  /api/posts               -> lista del user (filtros: status, client_id, platform, from, to)
// POST /api/posts               -> upsert (draft o scheduled). Si scheduled → emite Inngest.
// DELETE /api/posts?id=<uuid>   -> hard delete (para drafts sin publicar)
//
// Auth: cookies Supabase → auth.getUser(). Rate-limit: 60/min por user.
// La tabla `cm_scheduled_posts` vive en el schema `public`. Usamos el service
// role client con schema override porque nuestro `createClient()` default
// apunta a `smarttalk` (ver src/lib/supabase/server.ts).

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { rateLimit } from "@/lib/rate-limit";

// -- shared helpers -----------------------------------------------------------

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "posts route: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createSbClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const ALLOWED_PLATFORMS = new Set([
  "fb",
  "ig-feed",
  "ig-reel",
  "ig-story",
  "tiktok",
  "linkedin-personal",
  "linkedin-company",
  "x",
  "threads",
]);

const ALLOWED_STATUS = new Set(["draft", "scheduled", "published", "failed", "deleted"]);

function validatePayload(body: unknown):
  | { ok: true; value: {
      id?: string;
      client_id: string;
      platforms: string[];
      content: string;
      media_urls?: string[];
      scheduled_at?: string | null;
      status: "draft" | "scheduled";
      timezone?: string;
    } }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body inválido" };
  const b = body as Record<string, unknown>;

  const client_id = typeof b.client_id === "string" ? b.client_id : "";
  if (!client_id) return { ok: false, error: "client_id requerido" };

  const platforms = Array.isArray(b.platforms) ? b.platforms.filter((p): p is string => typeof p === "string") : [];
  if (platforms.length === 0) return { ok: false, error: "Selecciona al menos un canal" };
  for (const p of platforms) {
    if (!ALLOWED_PLATFORMS.has(p)) return { ok: false, error: `Canal inválido: ${p}` };
  }

  const content = typeof b.content === "string" ? b.content : "";
  if (!content.trim()) return { ok: false, error: "El contenido no puede estar vacío" };

  const status = typeof b.status === "string" ? b.status : "draft";
  if (status !== "draft" && status !== "scheduled") {
    return { ok: false, error: "status debe ser draft o scheduled" };
  }

  const scheduled_at =
    typeof b.scheduled_at === "string" && b.scheduled_at ? b.scheduled_at : null;

  if (status === "scheduled") {
    if (!scheduled_at) return { ok: false, error: "scheduled_at requerido cuando status=scheduled" };
    const ts = Date.parse(scheduled_at);
    if (Number.isNaN(ts)) return { ok: false, error: "scheduled_at inválido (ISO 8601 esperado)" };
    if (ts < Date.now() - 60_000) {
      return { ok: false, error: "scheduled_at debe ser futuro" };
    }
  }

  const media_urls = Array.isArray(b.media_urls)
    ? b.media_urls.filter((u): u is string => typeof u === "string")
    : undefined;

  return {
    ok: true,
    value: {
      id: typeof b.id === "string" ? b.id : undefined,
      client_id,
      platforms,
      content,
      media_urls,
      scheduled_at,
      status: status as "draft" | "scheduled",
      timezone: typeof b.timezone === "string" ? b.timezone : undefined,
    },
  };
}

// -- GET ----------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const rl = await rateLimit(`posts:list:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const clientId = url.searchParams.get("client_id");
  const platform = url.searchParams.get("platform");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (status && !ALLOWED_STATUS.has(status)) {
    return Response.json({ error: "status inválido" }, { status: 400 });
  }

  const supabase = getPublicAdmin();
  let q = supabase
    .from("cm_scheduled_posts")
    .select("*")
    .neq("status", "deleted")
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .limit(100);

  if (status) q = q.eq("status", status);
  if (clientId) q = q.eq("client_id", clientId);
  if (platform) q = q.contains("platforms", [platform]);
  if (from) q = q.gte("scheduled_date", from);
  if (to) q = q.lte("scheduled_date", to);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ posts: data ?? [] });
}

// -- POST (create / update) ---------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const rl = await rateLimit(`posts:write:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = validatePayload(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;

  const supabase = getPublicAdmin();

  const row = {
    client_id: v.client_id,
    content: v.content,
    media_urls: v.media_urls ?? [],
    platforms: v.platforms,
    status: v.status,
    scheduled_date: v.scheduled_at,
    scheduled_by: user.id,
    timezone: v.timezone ?? "America/Bogota",
    updated_at: new Date().toISOString(),
  };

  let postId = v.id;
  let dbError: string | null = null;

  if (v.id) {
    const { error } = await supabase
      .from("cm_scheduled_posts")
      .update(row)
      .eq("id", v.id);
    if (error) dbError = error.message;
  } else {
    const { data, error } = await supabase
      .from("cm_scheduled_posts")
      .insert(row)
      .select("id")
      .single();
    if (error) dbError = error.message;
    else postId = (data as { id: string } | null)?.id;
  }

  if (dbError || !postId) {
    return Response.json({ error: dbError ?? "No se pudo guardar el post" }, { status: 500 });
  }

  // Emitir evento Inngest cuando se programa. El worker de Sprint 22
  // (publish-scheduled-post) espera exactamente este payload.
  let inngestEventId: string | null = null;
  if (v.status === "scheduled" && v.scheduled_at) {
    try {
      const res = await inngest.send({
        name: INNGEST_EVENTS.POST_SCHEDULE_REQUESTED,
        data: { post_id: postId, scheduled_at: v.scheduled_at },
      });
      inngestEventId = res.ids?.[0] ?? null;
      if (inngestEventId) {
        // Tracking para el reaper (columna añadida en migr. 016).
        await supabase
          .from("cm_scheduled_posts")
          .update({ inngest_event_id: inngestEventId })
          .eq("id", postId);
      }
    } catch (err) {
      // Fail-soft: el post queda guardado como scheduled. El reaper
      // (reap-scheduled-posts) lo recogerá si el evento no cuajó.
      console.warn("[api/posts] inngest.send falló:", err instanceof Error ? err.message : err);
    }
  }

  return Response.json({
    id: postId,
    status: v.status,
    inngest_event_id: inngestEventId,
  });
}

// -- DELETE (hard delete via query param) -------------------------------------

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const rl = await rateLimit(`posts:write:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id requerido" }, { status: 400 });

  const supabase = getPublicAdmin();
  const { error } = await supabase.from("cm_scheduled_posts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
