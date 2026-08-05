// Sprint 26 · POST /api/media/generate
// ---------------------------------------------------------------------------
// Genera media con Fal.ai, descarga el resultado y lo re-sube a Supabase
// Storage para que el asset viva bajo nuestro dominio (no en la CDN de Fal).
//
// Auth: Supabase. Rate-limit: 30/min por user.
// Payload JSON:
//   {
//     client_id:    string (uuid),
//     type:         "image" | "video",
//     prompt:       string,
//     model?:       string,     // default flux-pro / kling-video
//     aspectRatio?: string,     // "1:1","16:9","9:16","4:5"
//     duration?:    number      // segundos (solo video)
//   }
//
// Retorna:
//   { ok: true, id, publicUrl, cost_usd_estimate, generation_time_s, origin }
//   { ok: false, error }
//
// Timeouts: 60s imagen, 180s video (kling tarda 60-120s).
// Si FAL_KEY no esta configurada -> error graceful { ok: false, error: '...' }.

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getCmClientAccess } from "@/lib/cm-client-access";
import {
  generateImage,
  generateVideo,
  estimateCostUsd,
  isFalConfigured,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from "@/lib/media/fal";
import { uploadAsset, downloadRemoteAsset } from "@/lib/media/storage";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingDeniedResponse,
  checkBillingFeature,
  recordBillingUsage,
} from "@/lib/billing/service";

export const maxDuration = 300; // Vercel: subir a 300s para dar margen a kling
export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

type Payload = {
  client_id: string;
  type: "image" | "video";
  prompt: string;
  model?: string;
  aspectRatio?: string;
  duration?: number;
};

function parsePayload(body: unknown): { ok: true; value: Payload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body invalido" };
  const b = body as Record<string, unknown>;
  const client_id = typeof b.client_id === "string" ? b.client_id : "";
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const type = b.type;
  if (!client_id) return { ok: false, error: "client_id requerido" };
  if (!prompt) return { ok: false, error: "prompt requerido" };
  if (type !== "image" && type !== "video") {
    return { ok: false, error: "type debe ser 'image' o 'video'" };
  }
  return {
    ok: true,
    value: {
      client_id,
      type,
      prompt,
      model: typeof b.model === "string" ? b.model : undefined,
      aspectRatio: typeof b.aspectRatio === "string" ? b.aspectRatio : undefined,
      duration: typeof b.duration === "number" ? b.duration : undefined,
    },
  };
}

function originFromModel(type: "image" | "video", model: string): "fal-flux" | "fal-kling" | "fal-veo" | "other-ai" {
  const m = model.toLowerCase();
  if (m.includes("flux")) return "fal-flux";
  if (m.includes("kling")) return "fal-kling";
  if (m.includes("veo")) return "fal-veo";
  return "other-ai";
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const rl = await rateLimit(`media:generate:${user.id}`, 30, 60_000);
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  if (!isFalConfigured()) {
    return Response.json(
      { ok: false, error: "FAL_KEY not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "JSON invalido" }, { status: 400 });
  }
  const parsed = parsePayload(body);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  const v = parsed.value;

  const access = await getCmClientAccess(req, v.client_id);
  if (!access || !access.organizationId) {
    return Response.json(
      { ok: false, error: "Cliente no encontrado o sin permisos" },
      { status: 403 },
    );
  }

  // Billing enforcement (almacenamiento): valida suscripción activa y que la
  // organización no haya agotado su cupo antes de gastar en generación. El
  // tamaño real del asset se registra tras subirlo al Storage.
  const storageDecision = await checkBillingFeature({
    organizationId: access.organizationId,
    featureCode: BILLING_FEATURES.STORAGE_BYTES,
    requestedUnits: 1,
    source: "api/media/generate",
  });
  if (!storageDecision.allowed) return billingDeniedResponse(storageDecision);

  const start = Date.now();
  const model = v.model || (v.type === "image" ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL);

  const gen = v.type === "image"
    ? await generateImage({
        prompt: v.prompt,
        model,
        aspectRatio: v.aspectRatio,
      })
    : await generateVideo({
        prompt: v.prompt,
        model,
        aspectRatio: v.aspectRatio,
        duration: v.duration,
      });

  if (!gen.ok) {
    return Response.json({ ok: false, error: `fal: ${gen.error}` }, { status: 502 });
  }

  // Descargar desde Fal CDN y re-subir a nuestro Storage.
  const downloaded = await downloadRemoteAsset(gen.data.url, 120_000);
  if (!downloaded.ok) {
    return Response.json(
      { ok: false, error: `download: ${downloaded.error}` },
      { status: 502 },
    );
  }
  const mimeType = gen.data.mimeType || downloaded.mimeType;
  const uploaded = await uploadAsset({
    file: downloaded.buffer,
    mimeType,
    organizationId: access.organizationId,
    clientId: access.clientId,
    folder: "ai",
  });
  if (!uploaded.ok) {
    return Response.json({ ok: false, error: uploaded.error }, { status: 500 });
  }

  const origin = originFromModel(v.type, model);
  const admin = createAdminClient("public");
  const costUsd = estimateCostUsd(model, v.duration);
  const generationTimeS = Math.round((Date.now() - start) / 100) / 10;

  const insertRow = {
    client_id: access.clientId,
    organization_id: access.organizationId,
    bucket: uploaded.bucket,
    storage_path: uploaded.path,
    public_url: uploaded.publicUrl,
    mime_type: uploaded.mimeType,
    size_bytes: uploaded.size,
    width: gen.data.width ?? null,
    height: gen.data.height ?? null,
    duration_seconds: gen.data.duration ?? null,
    origin,
    origin_metadata: {
      prompt: v.prompt,
      model,
      aspect_ratio: v.aspectRatio || null,
      duration: v.duration || null,
      fal_request_id: gen.requestId,
      cost_usd_estimate: costUsd,
      generation_time_s: generationTimeS,
      generated_by: user.id,
    },
    created_by: user.id,
  };
  const { data: inserted, error: insertError } = await admin
    .from("cm_media_assets")
    .insert(insertRow)
    .select("id, public_url")
    .single();

  if (insertError) {
    try {
      await admin.storage.from(uploaded.bucket).remove([uploaded.path]);
    } catch {
      /* noop */
    }
    return Response.json(
      { ok: false, error: `db insert: ${insertError.message}` },
      { status: 500 },
    );
  }

  await recordBillingUsage({
    organizationId: access.organizationId,
    featureCode: BILLING_FEATURES.STORAGE_BYTES,
    quantity: uploaded.size,
    idempotencyKey: `storage:${uploaded.path}`,
    sourceType: "media_generate",
    sourceId: inserted.id,
    periodStart: storageDecision.periodStart,
    periodEnd: storageDecision.periodEnd,
    metadata: { origin, mime_type: uploaded.mimeType },
  });

  return Response.json({
    ok: true,
    id: inserted.id,
    publicUrl: inserted.public_url,
    cost_usd_estimate: costUsd,
    generation_time_s: generationTimeS,
    origin,
  });
}
