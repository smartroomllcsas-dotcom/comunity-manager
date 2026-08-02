// Sprint 24 · CRUD single-post.
//
// GET    /api/posts/:id  -> single
// PATCH  /api/posts/:id  -> partial update (whitelist campos)
// DELETE /api/posts/:id  -> soft delete (status='deleted')
//
// Rate-limit: 60/min por user.

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "posts/[id] route: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
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

const PATCH_WHITELIST = new Set([
  "content",
  "media_urls",
  "platforms",
  "status",
  "scheduled_date",
  "timezone",
]);

const ALLOWED_STATUS = new Set(["draft", "scheduled", "published", "failed", "deleted"]);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;

  const rl = await rateLimit(`posts:read:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const supabase = getPublicAdmin();
  const { data, error } = await supabase
    .from("cm_scheduled_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json({ post: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;

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
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!PATCH_WHITELIST.has(k)) continue;
    if (k === "status" && typeof v === "string" && !ALLOWED_STATUS.has(v)) {
      return Response.json({ error: `status inválido: ${v}` }, { status: 400 });
    }
    patch[k] = v;
  }

  const supabase = getPublicAdmin();
  const { data, error } = await supabase
    .from("cm_scheduled_posts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json({ post: data });
}

// Soft delete: marca status='deleted' pero no borra la fila (auditoría).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;

  const rl = await rateLimit(`posts:write:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const supabase = getPublicAdmin();
  const { error } = await supabase
    .from("cm_scheduled_posts")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
