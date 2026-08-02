// Sprint 25 · Endpoint PÚBLICO (sin auth) para el portal magic-link.
//
// GET  /api/approval/<token>  → devuelve post + client (info no sensible)
// POST /api/approval/<token>  → cliente responde approve | reject
//
// Verificamos el HMAC del token; cruzamos SHA-256(token) contra
// cm_post_approvals.token_hash. Si válido y no consumido:
//  * approved → cm_scheduled_posts.status = 'scheduled' + approved_at
//  * rejected → cm_scheduled_posts.status = 'draft'    + last_error = 'Cliente rechazó: …'
//
// SECURITY:
//  * No exponemos el post_id/client_id crudos hasta pasar la verificación.
//  * Al expirar/rechazo devolvemos 410 GONE con mensaje friendly.
//  * Doble uso del token (ya respondido) → 409 CONFLICT.

import { NextRequest } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { verifyApprovalToken, hashToken } from "@/lib/approval/tokens";

function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "approval/[token]: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createSbClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

async function loadApprovalContext(token: string) {
  const decoded = verifyApprovalToken(token);
  if (!decoded.valid) {
    return { error: "Enlace expirado o inválido", status: 410 as const };
  }
  const admin = getPublicAdmin();
  const th = hashToken(token);
  const { data: approval, error } = await admin
    .from("cm_post_approvals")
    .select(
      "id, post_id, client_id, organization_id, status, expires_at, comments, responded_at, responded_by_email, responded_by_name",
    )
    .eq("token_hash", th)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 as const };
  if (!approval) return { error: "Enlace no encontrado", status: 410 as const };
  return { approval, decoded, admin };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await loadApprovalContext(token);
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }
  const { approval, admin } = ctx;

  const [{ data: post }, { data: client }] = await Promise.all([
    admin
      .from("cm_scheduled_posts")
      .select("id, content, media_urls, platforms, scheduled_date, timezone, status")
      .eq("id", approval.post_id)
      .maybeSingle(),
    admin
      .from("cm_clients")
      .select("id, name, brand_voice, industry, language")
      .eq("id", approval.client_id)
      .maybeSingle(),
  ]);

  if (!post) {
    return Response.json({ error: "Post no encontrado" }, { status: 410 });
  }

  return Response.json({
    approval: {
      id: approval.id,
      status: approval.status,
      expires_at: approval.expires_at,
      responded_at: approval.responded_at,
      comments: approval.comments,
      responded_by_name: approval.responded_by_name,
    },
    post: {
      content: post.content ?? "",
      media_urls: (post.media_urls as string[] | null) ?? [],
      platforms: (post.platforms as string[] | null) ?? [],
      scheduled_date: post.scheduled_date,
      timezone: post.timezone,
    },
    client: client
      ? {
          name: client.name,
          brand: client.brand_voice,
        }
      : null,
  });
}

interface RespondBody {
  decision: "approved" | "rejected";
  comments?: string;
  responded_by_email?: string;
  responded_by_name?: string;
}

function validateRespond(body: unknown):
  | { ok: true; value: RespondBody }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object")
    return { ok: false, error: "Body inválido" };
  const b = body as Record<string, unknown>;
  const decision = b.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "decision debe ser 'approved' o 'rejected'" };
  }
  const comments = typeof b.comments === "string" ? b.comments.slice(0, 2000) : undefined;
  const email = typeof b.responded_by_email === "string" ? b.responded_by_email.slice(0, 320) : undefined;
  const name = typeof b.responded_by_name === "string" ? b.responded_by_name.slice(0, 160) : undefined;
  if (decision === "rejected" && !comments) {
    return { ok: false, error: "Se requiere un comentario para rechazar" };
  }
  return {
    ok: true,
    value: {
      decision,
      comments,
      responded_by_email: email,
      responded_by_name: name,
    },
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await loadApprovalContext(token);
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }
  const { approval, admin } = ctx;

  if (approval.status !== "pending") {
    return Response.json(
      { error: `Ya respondido (${approval.status})` },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = validateRespond(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;

  const now = new Date().toISOString();

  // 1) Update approval row.
  const { error: updateErr } = await admin
    .from("cm_post_approvals")
    .update({
      status: v.decision,
      comments: v.comments ?? null,
      responded_by_email: v.responded_by_email ?? null,
      responded_by_name: v.responded_by_name ?? null,
      responded_at: now,
    })
    .eq("id", approval.id);
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  // 2) Propagar a cm_scheduled_posts.
  if (v.decision === "approved") {
    // Solo movemos a 'scheduled' si tiene fecha. Si no, queda draft (aprobado esperando fecha).
    const { data: post } = await admin
      .from("cm_scheduled_posts")
      .select("scheduled_date")
      .eq("id", approval.post_id)
      .maybeSingle();
    const nextStatus = (post as { scheduled_date?: string | null } | null)?.scheduled_date
      ? "scheduled"
      : "draft";
    await admin
      .from("cm_scheduled_posts")
      .update({
        status: nextStatus,
        approved_at: now,
        // approved_by es UUID; para respuestas de cliente lo dejamos NULL y
        // el email queda en cm_post_approvals.responded_by_email.
        updated_at: now,
      })
      .eq("id", approval.post_id);
  } else {
    await admin
      .from("cm_scheduled_posts")
      .update({
        status: "draft",
        last_error: `Cliente rechazó: ${v.comments ?? ""}`.slice(0, 500),
        updated_at: now,
      })
      .eq("id", approval.post_id);
  }

  // 3) TODO(sprint-25): emitir webhook a la agencia (evento Inngest o call directa).
  console.info("[approval] decision recorded", {
    approval_id: approval.id,
    decision: v.decision,
  });

  return Response.json({
    ok: true,
    status: v.decision,
    responded_at: now,
  });
}
