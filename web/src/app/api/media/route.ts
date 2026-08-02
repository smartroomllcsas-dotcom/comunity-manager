// Sprint 26 · GET/DELETE /api/media
// ---------------------------------------------------------------------------
// GET  ?client_id=UUID&type=image|video&limit=50&offset=0  -> lista
// DELETE ?id=UUID                                          -> borra (storage + DB)
//
// Auth: Supabase. Rate-limit: 120/min por user (GET) / 30/min (DELETE).

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { deleteAsset } from "@/lib/media/storage";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// -- GET ----------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const rl = await rateLimit(`media:list:${user.id}`, 120, 60_000);
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const typeParam = url.searchParams.get("type"); // 'image' | 'video' | null
  const originParam = url.searchParams.get("origin"); // 'upload' | 'ai' | null
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  if (!clientId) {
    return Response.json({ ok: false, error: "client_id requerido" }, { status: 400 });
  }
  const access = await getCmClientAccess(req, clientId);
  if (!access || !access.organizationId) {
    return Response.json(
      { ok: false, error: "Cliente no encontrado o sin permisos" },
      { status: 403 },
    );
  }

  const admin = createAdminClient("public");
  let q = admin
    .from("cm_media_assets")
    .select("id, client_id, storage_path, public_url, mime_type, size_bytes, width, height, duration_seconds, origin, origin_metadata, created_at")
    .eq("client_id", access.clientId)
    .eq("organization_id", access.organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (typeParam === "image") {
    q = q.like("mime_type", "image/%");
  } else if (typeParam === "video") {
    q = q.like("mime_type", "video/%");
  }

  if (originParam === "upload") {
    q = q.eq("origin", "upload");
  } else if (originParam === "ai") {
    q = q.in("origin", ["fal-flux", "fal-kling", "fal-veo", "other-ai"]);
  }

  const { data, error } = await q;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, assets: data ?? [] });
}

// -- DELETE -------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const rl = await rateLimit(`media:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ ok: false, error: "id requerido" }, { status: 400 });
  }

  const admin = createAdminClient("public");
  // Cargar el asset para conocer client_id + storage_path
  const { data: asset, error: findError } = await admin
    .from("cm_media_assets")
    .select("id, client_id, storage_path, bucket, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (findError) {
    return Response.json({ ok: false, error: findError.message }, { status: 500 });
  }
  if (!asset) {
    return Response.json({ ok: false, error: "Asset no encontrado" }, { status: 404 });
  }

  // Verifica que el user tenga acceso al cliente dueño
  const access = await getCmClientAccess(req, asset.client_id as string);
  if (
    !access ||
    !access.organizationId ||
    access.organizationId !== asset.organization_id
  ) {
    return Response.json(
      { ok: false, error: "Sin permisos sobre este asset" },
      { status: 403 },
    );
  }

  // Borrar del Storage primero (best effort); despues DB.
  const removed = await deleteAsset(asset.storage_path as string);
  if (!removed.ok) {
    // Loggear pero seguir con delete de DB para no dejar zombies.
    console.warn(`[api/media DELETE] storage.remove fallo: ${removed.error}`);
  }
  const { error: delError } = await admin
    .from("cm_media_assets")
    .delete()
    .eq("id", id);
  if (delError) {
    return Response.json({ ok: false, error: delError.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
