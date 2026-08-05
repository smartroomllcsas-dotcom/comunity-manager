// Sprint 26 · POST /api/media/upload
// ---------------------------------------------------------------------------
// Multipart/form-data upload: sube al bucket cm-assets e inserta row en
// public.cm_media_assets con origin='upload'.
//
// Auth: Supabase (createClient/server). Rate-limit: 60/min por user.
// Payload:
//   - file      (Blob, required, max 100 MB, image/* | video/mp4 | video/mov)
//   - client_id (string uuid, required — se valida acceso via getCmClientAccess)
//
// Retorna: { ok: true, id, publicUrl, path, size, mimeType }
//          { ok: false, error }

import { NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { getCmClientAccess } from "@/lib/cm-client-access";
import {
  uploadAsset,
  isAllowedMime,
  MAX_UPLOAD_BYTES,
} from "@/lib/media/storage";
import { BILLING_FEATURES } from "@/lib/billing/features";
import {
  billingDeniedResponse,
  checkBillingFeature,
  recordBillingUsage,
} from "@/lib/billing/service";

export const maxDuration = 60; // Vercel serverless: 60s max
export const runtime = "nodejs"; // needs Buffer/crypto

async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return Response.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const rl = await rateLimit(`media:upload:${user.id}`, 60, 60_000);
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: "Rate limit excedido", retry_after_seconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "form-data invalido" }, { status: 400 });
  }

  const file = form.get("file");
  const clientId = form.get("client_id");
  if (!(file instanceof Blob)) {
    return Response.json({ ok: false, error: "campo `file` requerido" }, { status: 400 });
  }
  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ ok: false, error: "campo `client_id` requerido" }, { status: 400 });
  }

  // Validaciones tempranas
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { ok: false, error: `Archivo excede 100 MB (${Math.round(file.size / 1024 / 1024)} MB)` },
      { status: 413 },
    );
  }
  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedMime(mimeType)) {
    return Response.json(
      { ok: false, error: `Mime type no permitido: ${mimeType}` },
      { status: 415 },
    );
  }

  // Autoriza acceso al cliente + obtiene organization_id
  const access = await getCmClientAccess(req, clientId);
  if (!access || !access.organizationId) {
    return Response.json(
      { ok: false, error: "Cliente no encontrado o sin permisos" },
      { status: 403 },
    );
  }

  // Billing enforcement (almacenamiento): valida suscripción activa y cupo de
  // bytes disponible antes de subir. El superadmin queda sin límites.
  const storageDecision = await checkBillingFeature({
    organizationId: access.organizationId,
    featureCode: BILLING_FEATURES.STORAGE_BYTES,
    requestedUnits: file.size,
    source: "api/media/upload",
  });
  if (!storageDecision.allowed) return billingDeniedResponse(storageDecision);

  // Sube al Storage
  const uploaded = await uploadAsset({
    file,
    mimeType,
    organizationId: access.organizationId,
    clientId: access.clientId,
    sizeBytes: file.size,
  });
  if (!uploaded.ok) {
    return Response.json({ ok: false, error: uploaded.error }, { status: 500 });
  }

  // Inserta row en cm_media_assets
  const admin = createAdminClient("public");
  const originalName = form.get("filename");
  const insertRow = {
    client_id: access.clientId,
    organization_id: access.organizationId,
    bucket: uploaded.bucket,
    storage_path: uploaded.path,
    public_url: uploaded.publicUrl,
    mime_type: uploaded.mimeType,
    size_bytes: uploaded.size,
    origin: "upload" as const,
    origin_metadata: {
      original_filename: typeof originalName === "string" ? originalName : null,
      uploaded_by: user.id,
    },
    created_by: user.id,
  };
  const { data: inserted, error: insertError } = await admin
    .from("cm_media_assets")
    .insert(insertRow)
    .select("id, public_url, storage_path")
    .single();

  if (insertError) {
    // Compensar: intentar borrar el objeto del bucket para no dejar huerfanos.
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
    idempotencyKey: `storage:${inserted.storage_path}`,
    sourceType: "media_upload",
    sourceId: inserted.id,
    periodStart: storageDecision.periodStart,
    periodEnd: storageDecision.periodEnd,
    metadata: { mime_type: uploaded.mimeType },
  });

  return Response.json({
    ok: true,
    id: inserted.id,
    publicUrl: inserted.public_url,
    path: inserted.storage_path,
    size: uploaded.size,
    mimeType: uploaded.mimeType,
  });
}
